-- 28-profile-completion-fields.sql
-- Add profile completion fields to organization_users table

ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS nome_completo TEXT;
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS ano_nascimento INTEGER;
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS foto_perfil TEXT;
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS funcao TEXT;
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;
