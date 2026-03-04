-- =====================================================================
-- Migration 19: Set default passwords for mentorados
-- All mentorados get 'medicosderesultado' as default password
-- kellybsantoss@icloud.com gets 'kelly123' (admin)
-- The login endpoint auto-migrates plain text to bcrypt on first login
-- =====================================================================

-- Set default password for all mentorados without a password
UPDATE mentorados
SET password_hash = 'medicosderesultado'
WHERE password_hash IS NULL;

-- Set specific password for admin user
UPDATE mentorados
SET password_hash = 'kelly123'
WHERE LOWER(email) = 'kellybsantos@icloud.com';

DO $$ BEGIN RAISE NOTICE 'Migration 19 complete — default passwords set for all mentorados'; END $$;
