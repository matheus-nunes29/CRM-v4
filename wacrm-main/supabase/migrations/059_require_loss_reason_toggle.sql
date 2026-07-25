-- 059_require_loss_reason_toggle.sql
-- Per-account toggle: when true, marking a deal as lost requires picking
-- a loss_reason_id. Defaults to false so existing accounts keep today's
-- optional behavior until an admin opts in from Settings → Negócios.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS require_loss_reason BOOLEAN NOT NULL DEFAULT false;
