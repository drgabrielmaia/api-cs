-- =====================================================================
-- Seed Data: Organization + Admin Users
-- =====================================================================

-- 1. Create organization
INSERT INTO organizations (id, name, owner_email, admin_phone)
VALUES (
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'Médicos de resultados',
    'gabrielslmaia@hotmail.com',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create profiles for admin users
-- User 1: emersonbljr2802@gmail.com
INSERT INTO profiles (id, user_id, nome_completo, organization_id, tipo_usuario)
VALUES (
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'Emerson',
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'admin'
)
ON CONFLICT (id) DO NOTHING;

-- User 2: gabrielslmaia@hotmail.com
INSERT INTO profiles (id, user_id, nome_completo, organization_id, tipo_usuario)
VALUES (
    'b0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'Gabriel',
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'admin'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Link users to organization
INSERT INTO organization_users (id, organization_id, user_id, email, role, is_active)
VALUES
    (
        'd0000000-0000-4000-8000-000000000001',
        '9c8c0033-15ea-4e33-a55f-28d81a19693b',
        'c0000000-0000-4000-8000-000000000001',
        'emersonbljr2802@gmail.com',
        'owner',
        true
    ),
    (
        'd0000000-0000-4000-8000-000000000002',
        '9c8c0033-15ea-4e33-a55f-28d81a19693b',
        'c0000000-0000-4000-8000-000000000002',
        'gabrielslmaia@hotmail.com',
        'owner',
        true
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Create usuarios_financeiro entries (with hashed passwords)
INSERT INTO usuarios_financeiro (id, nome, email, senha_hash, role, ativo, organization_id)
VALUES
    (
        'e0000000-0000-4000-8000-000000000001',
        'Emerson',
        'emersonbljr2802@gmail.com',
        crypt('senha123', gen_salt('bf')),
        'admin',
        true,
        '9c8c0033-15ea-4e33-a55f-28d81a19693b'
    ),
    (
        'e0000000-0000-4000-8000-000000000002',
        'Gabriel',
        'gabrielslmaia@hotmail.com',
        crypt('k5oetybr.', gen_salt('bf')),
        'admin',
        true,
        '9c8c0033-15ea-4e33-a55f-28d81a19693b'
    )
ON CONFLICT (id) DO NOTHING;

-- 5. Initialize default kanban board for the org
SELECT initialize_default_kanban(
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'c0000000-0000-4000-8000-000000000001'
);

-- =====================================================================
-- Seed complete.
-- Org: Médicos de resultados
-- Users: emersonbljr2802@gmail.com, gabrielslmaia@hotmail.com
-- =====================================================================
