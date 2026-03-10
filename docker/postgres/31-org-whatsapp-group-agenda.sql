-- 31-org-whatsapp-group-agenda.sql
-- Ensure whatsapp_group_agenda column exists on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_group_agenda TEXT;

-- Add is_active to contract_templates
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
