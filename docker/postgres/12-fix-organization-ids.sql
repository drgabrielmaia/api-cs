-- ============================================================
-- 12 - Fix organization IDs: move everything to the REAL org
-- Real org: 9c8c0033-15ea-4e33-a55f-28d81a19693b (Médicos de Resultado)
-- Mock org: a0000000-0000-4000-8000-000000000001 (seed data - NÃO USAR)
-- Run: docker exec -i cssystem-db psql -U postgres -d cssystem < docker/postgres/12-fix-organization-ids.sql
-- ============================================================

-- Ensure the real organization exists
INSERT INTO organizations (id, name, owner_email, created_at, updated_at)
VALUES (
  '9c8c0033-15ea-4e33-a55f-28d81a19693b',
  'Médicos de Resultado',
  'gabrielslmaia@hotmail.com',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET name = 'Médicos de Resultado', updated_at = NOW();

-- =============================================
-- PART 1: Move ALL mentorados to the real org
-- =============================================
UPDATE mentorados
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id IS NULL
   OR organization_id = 'a0000000-0000-4000-8000-000000000001'
   OR organization_id != '9c8c0033-15ea-4e33-a55f-28d81a19693b';

-- Activate ALL mentorados
UPDATE mentorados SET status_login = 'ativo' WHERE status_login IS NULL OR status_login != 'ativo';
UPDATE mentorados SET ativo = true WHERE ativo IS NULL OR ativo = false;

-- Set password for all
UPDATE mentorados SET senha = 'medicosderesultado' WHERE senha IS NULL OR senha = '';

-- =============================================
-- PART 2: Move ALL video_modules to the real org
-- =============================================
UPDATE video_modules
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id IS NULL
   OR organization_id = 'a0000000-0000-4000-8000-000000000001'
   OR organization_id != '9c8c0033-15ea-4e33-a55f-28d81a19693b';

-- Activate all modules
UPDATE video_modules SET is_active = true WHERE is_active IS NULL OR is_active = false;
UPDATE video_modules SET is_published = true WHERE is_published IS NULL OR is_published = false;

-- =============================================
-- PART 3: Recreate access control for ALL mentorados x ALL modules
-- =============================================
DELETE FROM video_access_control;

INSERT INTO video_access_control (mentorado_id, module_id, has_access, granted_at, granted_by)
SELECT m.id, vm.id, true, NOW(), 'admin'
FROM mentorados m
CROSS JOIN video_modules vm
WHERE m.organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
  AND vm.organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
ON CONFLICT DO NOTHING;

-- =============================================
-- PART 4: Fix other tables that reference mock org
-- =============================================
UPDATE organization_users
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE leads
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE closers
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE calendar_events
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE form_templates
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE comissoes
SET organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

-- =============================================
-- VERIFICATION
-- =============================================
SELECT 'Mentorados na org certa:' AS info, COUNT(*) AS total
FROM mentorados WHERE organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b';

SELECT 'Mentorados ativos:' AS info, COUNT(*) AS total
FROM mentorados WHERE status_login = 'ativo';

SELECT 'Módulos na org certa:' AS info, COUNT(*) AS total
FROM video_modules WHERE organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b';

SELECT 'Access records:' AS info, COUNT(*) AS total
FROM video_access_control WHERE has_access = true;

SELECT 'Mentorados na org ERRADA:' AS info, COUNT(*) AS total
FROM mentorados WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';
