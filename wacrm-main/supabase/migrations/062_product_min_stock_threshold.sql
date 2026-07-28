-- 062_product_min_stock_threshold.sql
-- "Quantidade mínima segura" per product — powers the red/amber
-- indicator in the Estoque module. Only meaningful (and only editable
-- in the UI) for products with tracks_stock=true, itself gated behind
-- the account's 'estoque' feature — no separate feature gate needed
-- here since a NULL threshold simply means "no alert", harmless for
-- every other account.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_stock_threshold NUMERIC(12,3);

COMMENT ON COLUMN products.min_stock_threshold IS
  'Optional minimum safe quantity. Estoque UI shows red at or below this, amber between this and 2x this, and normal above.';
