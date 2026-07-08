-- ============================================================
-- 039_products.sql
--
-- Cadastro de produtos e serviços + itens de negócio.
-- O valor do negócio é calculado automaticamente como soma
-- dos itens via trigger.
-- ============================================================

-- ── Produtos & Serviços ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  description   TEXT,
  type          TEXT          NOT NULL DEFAULT 'product'
                              CHECK (type IN ('product', 'service')),
  default_price NUMERIC(12,2),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON products FOR SELECT USING (is_account_member(account_id));
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY products_update ON products FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY products_delete ON products FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ── Itens de negócio ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deal_items (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id     UUID          NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  account_id  UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id  UUID          REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT          NOT NULL,
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity    NUMERIC(12,3) NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_items_deal    ON deal_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_items_account ON deal_items(account_id);

ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_items_select ON deal_items FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_items_insert ON deal_items FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_items_update ON deal_items FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deal_items_delete ON deal_items FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ── Trigger: sincroniza deals.value com a soma dos itens ──────

CREATE OR REPLACE FUNCTION sync_deal_value()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deal_id UUID;
BEGIN
  v_deal_id := COALESCE(NEW.deal_id, OLD.deal_id);

  UPDATE deals
  SET value = (
    SELECT COALESCE(SUM(price * quantity), 0)
    FROM deal_items
    WHERE deal_id = v_deal_id
  )
  WHERE id = v_deal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_value ON deal_items;
CREATE TRIGGER trg_sync_deal_value
AFTER INSERT OR UPDATE OR DELETE ON deal_items
FOR EACH ROW EXECUTE FUNCTION sync_deal_value();
