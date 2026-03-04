-- =====================================================================
-- Migration 20: Add Kelly as admin user + fix org_id in usuarios_financeiro
-- =====================================================================

-- Fix organization_id for existing users
UPDATE usuarios_financeiro
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

-- Add Kelly as admin
INSERT INTO usuarios_financeiro (id, nome, email, senha_hash, role, ativo, organization_id)
VALUES (
    gen_random_uuid(),
    'Kelly',
    'kellybsantoss@icloud.com',
    crypt('kelly123', gen_salt('bf')),
    'admin',
    true,
    '9c8c0033-15ea-4e33-a55f-28d81a19693b'
)
ON CONFLICT (email) DO UPDATE SET
    senha_hash = crypt('kelly123', gen_salt('bf')),
    role = 'admin',
    ativo = true,
    organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b';

DO $$ BEGIN RAISE NOTICE 'Migration 20 complete — Kelly added as admin'; END $$;
