-- 057_feature_gate_estoque.sql
--
-- Gates product_stock_lots / stock_movements (056) behind
-- account_has_feature(account_id, 'estoque'). No changes to `products`
-- policies — the new unit/tracks_stock columns are read/written through
-- the same products_select/insert/update/delete policies from 039.
--
-- Deliberately NO backfill of enabled_features here, unlike
-- 052/053/054_feature_gate_*.sql. Those gated functionality that was
-- *already in production use* — skipping their backfill would have
-- locked out existing customers (the Mayara account, specifically) the
-- moment the gate landed. 'estoque' is the opposite: these tables didn't
-- exist before this migration, so there is no account — not even Mayara,
-- who uses patient_records heavily — with a single row in them. Starting
-- everyone off (nobody has the feature until a platform admin flips it on
-- in /admin) takes nothing away from anyone.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS stock_lots_select ON product_stock_lots;
CREATE POLICY stock_lots_select ON product_stock_lots FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'estoque')
);

DROP POLICY IF EXISTS stock_lots_insert ON product_stock_lots;
CREATE POLICY stock_lots_insert ON product_stock_lots FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'estoque')
);
-- No UPDATE policy: quantity_remaining only ever changes via the
-- apply_stock_movement trigger (056); lot_number/expiration_date have no
-- edit use case in this v1 — correcting a wrong lot is a manual
-- adjustment movement, not editing the lot record itself.
-- No DELETE policy: a lot that already has movements against it doesn't
-- get "undone" — ON DELETE CASCADE on stock_movements.lot_id would erase
-- ledger history, which defeats the point of an audit trail.

DROP POLICY IF EXISTS stock_movements_select ON stock_movements;
CREATE POLICY stock_movements_select ON stock_movements FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'estoque')
);

DROP POLICY IF EXISTS stock_movements_insert ON stock_movements;
CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'estoque')
);
-- No UPDATE/DELETE — append-only ledger, same spirit as patient_records.
