-- =====================================================================
-- Migration 25: Clinica rejection reason, new user, follow-up responses
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Add rejection reason column to clinicas
-- =====================================================================
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS revisado_por UUID;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS revisado_em TIMESTAMPTZ;

-- =====================================================================
-- 2. Create user: anapfs00@gmail.com with password GPN3srG7
-- =====================================================================

-- Add to organization_users for Médicos de Resultado
INSERT INTO organization_users (id, organization_id, email, role, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'anapfs00@gmail.com',
    'manager',
    true,
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Add to profiles table
INSERT INTO profiles (id, user_id, nome_completo, organization_id, tipo_usuario, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    gen_random_uuid(),
    'Ana',
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'admin',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Add as closer (so they can log in via closer login)
INSERT INTO closers (id, nome_completo, email, organization_id, tipo_closer, status_login, ativo, password_hash, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'Ana',
    'anapfs00@gmail.com',
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'closer',
    'ativo',
    true,
    crypt('GPN3srG7', gen_salt('bf')),
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- =====================================================================
-- 3. Add follow-up response tracking columns
-- =====================================================================

-- Ensure respostas_recebidas column exists for storing responses
-- Already in schema but add index for performance
CREATE INDEX IF NOT EXISTS idx_followup_exec_status ON lead_followup_executions(status);
CREATE INDEX IF NOT EXISTS idx_followup_exec_sequence ON lead_followup_executions(sequence_id);
CREATE INDEX IF NOT EXISTS idx_followup_exec_lead ON lead_followup_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_exec_next ON lead_followup_executions(proxima_execucao) WHERE status = 'active';

-- =====================================================================
-- 4. Add WhatsApp group config for auto-notifications
-- =====================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_group_aulas TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_group_eventos TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_auto_notify_aula BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS whatsapp_auto_notify_evento BOOLEAN DEFAULT false;

COMMIT;
