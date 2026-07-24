-- 056_estoque_schema.sql
--
-- Stock/inventory management for the clinic vertical. Connects to what
-- already exists in production (patient_records.products_used, a loose
-- JSONB of {name, lot, expiration, quantity} typed free-hand) rather than
-- building a parallel system: when a products_used entry carries a
-- product_id + lot_id + numeric quantity, this schema automatically
-- deducts it from stock. Entries in the old free-text shape (no
-- product_id) are left untouched — the Mayara account already writes
-- that shape today and must keep working exactly as-is.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- products — add unit + opt-in stock tracking
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- product_stock_lots — one row per physical batch received.
-- quantity_remaining is NEVER written directly by the app; it's only
-- ever mutated by the apply_stock_movement trigger below.
-- ============================================================
CREATE TABLE IF NOT EXISTS product_stock_lots (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id         UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_number         TEXT          NOT NULL,
  expiration_date    DATE,
  quantity_received  NUMERIC(12,3) NOT NULL CHECK (quantity_received > 0),
  quantity_remaining NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_lots_account ON product_stock_lots(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_lots_product ON product_stock_lots(product_id, expiration_date);

-- ============================================================
-- stock_movements — append-only ledger. Every change in
-- quantity_remaining traces back to exactly one row here explaining why.
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id         UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_id             UUID          NOT NULL REFERENCES product_stock_lots(id) ON DELETE CASCADE,
  movement_type      TEXT          NOT NULL
                                   CHECK (movement_type IN ('entrada', 'uso_clinico', 'ajuste_perda', 'ajuste_contagem')),
  quantity           NUMERIC(12,3) NOT NULL CHECK (quantity <> 0),
  patient_record_id  UUID          REFERENCES patient_records(id) ON DELETE SET NULL,
  reason             TEXT,
  created_by         UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_account ON stock_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_lot ON stock_movements(lot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_patient_record ON stock_movements(patient_record_id) WHERE patient_record_id IS NOT NULL;

ALTER TABLE product_stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
-- No policies yet on purpose — both gated in 057_feature_gate_estoque.sql.
-- RLS enabled + zero policies = deny-all until that migration lands.

-- ============================================================
-- apply_stock_movement() — the ONE place quantity_remaining changes.
--
-- SECURITY DEFINER: product_stock_lots has no client-facing UPDATE
-- policy (057) — quantity_remaining must never be editable directly, only
-- derived from the ledger. Running as SECURITY INVOKER here would mean
-- RLS silently blocks this very UPDATE (0 rows affected, no error,
-- balance never changes, nobody notices) — this mirrors the existing
-- _bcast_bump/broadcast_recipient_aggregate_trigger pattern for
-- trigger-maintained derived counters.
--
-- Because SECURITY DEFINER bypasses RLS, this function must defend for
-- itself against a cross-account lot_id (a lot from a different account
-- accidentally or maliciously referenced) — RLS can't catch that here.
--
-- Blocks the balance from going negative (RAISE EXCEPTION, rolling back
-- the whole transaction) rather than just logging it: there's no such
-- thing as a real negative stock balance for injectables, so a would-be
-- negative means the wrong lot was picked or the deduction is wrong —
-- better to fail loud. The manual 'ajuste_contagem' path is the escape
-- hatch to correct any real-world drift without needing support.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot_account_id UUID;
  v_lot_product_id UUID;
  v_new_remaining NUMERIC(12,3);
BEGIN
  SELECT account_id, product_id INTO v_lot_account_id, v_lot_product_id
  FROM product_stock_lots WHERE id = NEW.lot_id;

  IF v_lot_account_id IS DISTINCT FROM NEW.account_id
     OR v_lot_product_id IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'Lote % não pertence à conta/produto informado', NEW.lot_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE product_stock_lots
  SET quantity_remaining = quantity_remaining + NEW.quantity
  WHERE id = NEW.lot_id
  RETURNING quantity_remaining INTO v_new_remaining;

  IF v_new_remaining < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente no lote % (saldo resultante: %)', NEW.lot_id, v_new_remaining
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION apply_stock_movement() OWNER TO postgres;
REVOKE ALL ON FUNCTION apply_stock_movement() FROM PUBLIC;
-- Trigger-only — nothing calls this via RPC directly (same treatment as
-- broadcast_recipient_aggregate_trigger in 053). Firing only ever happens
-- via the INSERT into stock_movements itself, which doesn't depend on an
-- EXECUTE grant on this function.
REVOKE EXECUTE ON FUNCTION apply_stock_movement() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_apply_stock_movement ON stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ============================================================
-- apply_patient_record_stock_usage() — automatic deduction from clinical
-- use. SECURITY INVOKER: runs as the professional saving the evolution,
-- who already has agent+ and therefore already satisfies the
-- stock_movements INSERT policy (057) — no RLS bypass needed here, only
-- the trigger above (which actually mutates the lot) needs it.
--
-- Backwards compatible by construction: only acts on products_used
-- entries that already carry product_id + lot_id + quantity. The old
-- free-text shape ({name, lot, expiration, quantity} with no product_id)
-- — exactly what the Mayara account writes today — is left untouched.
-- Nothing changes for any account without the 'estoque' feature, because
-- their UI never produces the new shape in the first place.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_patient_record_stock_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_lot_id UUID;
  v_quantity NUMERIC(12,3);
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.products_used)
  LOOP
    IF NOT (v_item ? 'product_id' AND v_item ? 'lot_id' AND v_item ? 'quantity') THEN
      CONTINUE;
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_lot_id := NULLIF(v_item->>'lot_id', '')::UUID;
    v_quantity := NULLIF(v_item->>'quantity', '')::NUMERIC;

    IF v_product_id IS NULL OR v_lot_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO stock_movements (
      account_id, product_id, lot_id, movement_type, quantity,
      patient_record_id, created_by
    ) VALUES (
      NEW.account_id, v_product_id, v_lot_id, 'uso_clinico', -v_quantity,
      NEW.id, NEW.professional_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION apply_patient_record_stock_usage() OWNER TO postgres;
REVOKE ALL ON FUNCTION apply_patient_record_stock_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_patient_record_stock_usage() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_patient_record_stock_usage ON patient_records;
CREATE TRIGGER trg_patient_record_stock_usage
AFTER INSERT ON patient_records
FOR EACH ROW EXECUTE FUNCTION apply_patient_record_stock_usage();
