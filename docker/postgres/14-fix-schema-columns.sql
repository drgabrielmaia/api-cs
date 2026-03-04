-- =====================================================================
-- Migration 14: Align schema columns with Supabase data export
-- Adds missing columns to calendar_events and notifications
-- =====================================================================

-- =====================================================================
-- calendar_events: rename columns to match Supabase + add missing ones
-- =====================================================================

-- Rename existing columns to match Supabase naming
ALTER TABLE calendar_events RENAME COLUMN start_time TO start_datetime;
ALTER TABLE calendar_events RENAME COLUMN end_time TO end_datetime;
ALTER TABLE calendar_events RENAME COLUMN meet_link TO link_meet;

-- Add missing columns from Supabase
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'agendada';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS sale_value NUMERIC;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS result_notes TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS mensagem_enviada BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS tipo_call TEXT DEFAULT 'vendas';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS origem_agendamento TEXT DEFAULT 'manual';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS token_agendamento TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS nome_contato TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS email_contato TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS telefone_contato TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS whatsapp_contato TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS objetivo_call TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS status_confirmacao TEXT DEFAULT 'agendado';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS notificacao_enviada BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS valor_produto NUMERIC;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS link_cancelamento TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- Recreate index with new column name
DROP INDEX IF EXISTS idx_calendar_events_start;
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_datetime);

-- =====================================================================
-- appointments: rename columns to match (same pattern)
-- =====================================================================
ALTER TABLE appointments RENAME COLUMN start_time TO start_datetime;
ALTER TABLE appointments RENAME COLUMN end_time TO end_datetime;
ALTER TABLE appointments RENAME COLUMN meet_link TO link_meet;

-- =====================================================================
-- notifications: add missing columns from Supabase
-- =====================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT FALSE;

-- =====================================================================
-- onboarding_schedules: rename if exists
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onboarding_schedules' AND column_name='start_time') THEN
    ALTER TABLE onboarding_schedules RENAME COLUMN start_time TO start_datetime;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onboarding_schedules' AND column_name='end_time') THEN
    ALTER TABLE onboarding_schedules RENAME COLUMN end_time TO end_datetime;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='onboarding_schedules' AND column_name='meet_link') THEN
    ALTER TABLE onboarding_schedules RENAME COLUMN meet_link TO link_meet;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Migration 14 complete — schema columns aligned with Supabase'; END $$;
