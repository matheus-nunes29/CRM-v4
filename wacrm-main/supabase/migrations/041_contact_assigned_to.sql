-- 041_contact_assigned_to.sql
-- Adds contacts.assigned_to (responsible user) and a trigger that keeps
-- all deals for that contact in sync whenever the contact's owner changes.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);

-- Trigger function: on any change to contacts.assigned_to,
-- propagate the new value to every deal linked to that contact.
CREATE OR REPLACE FUNCTION sync_deal_assignee_from_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    UPDATE deals
    SET assigned_to = NEW.assigned_to,
        updated_at  = now()
    WHERE contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_assignee ON contacts;
CREATE TRIGGER trg_sync_deal_assignee
  AFTER UPDATE OF assigned_to ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION sync_deal_assignee_from_contact();
