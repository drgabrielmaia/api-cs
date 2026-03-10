-- 31-org-whatsapp-group-agenda.sql
-- Ensure whatsapp_group_agenda column exists on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_group_agenda TEXT;
