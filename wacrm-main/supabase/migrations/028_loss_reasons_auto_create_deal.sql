-- 028: loss_reasons table, deals.loss_reason_id, pipelines.auto_create_deal

-- Loss reasons (editable per account in Settings → Negócios)
CREATE TABLE loss_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loss_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account members can manage loss reasons"
  ON loss_reasons
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

-- Attach loss reason to a deal (nullable: not all deals are lost)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS loss_reason_id UUID
    REFERENCES loss_reasons(id) ON DELETE SET NULL;

-- Per-pipeline toggle: auto-create a deal in "Novo Lead" when a new
-- contact is created via inbound WhatsApp message
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS auto_create_deal BOOLEAN NOT NULL DEFAULT false;
