-- =====================================================================
-- 07-schema-fixes.sql
-- Fix column mismatches between frontend and database schema
-- Safe to re-run (uses ADD COLUMN IF NOT EXISTS)
-- =====================================================================

-- =====================================================================
-- 1. closer_levels - Frontend uses completely different columns
-- =====================================================================
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS nome_nivel TEXT;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS meta_faturado DECIMAL(10,2) DEFAULT 0;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS meta_arrecadado DECIMAL(10,2) DEFAULT 0;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS porcentagem_minima DECIMAL(5,2) DEFAULT 0;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS comissao_percentual DECIMAL(5,2) DEFAULT 0;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS cor TEXT;
ALTER TABLE closer_levels ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

-- =====================================================================
-- 2. closers - Missing closer_level_id FK
-- =====================================================================
ALTER TABLE closers ADD COLUMN IF NOT EXISTS closer_level_id UUID REFERENCES closer_levels(id);

-- =====================================================================
-- 3. icp_form_templates - Frontend uses English names
--    Schema: titulo, descricao, campos, ativo
--    Frontend: name, description, fields, is_active
-- =====================================================================
ALTER TABLE icp_form_templates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE icp_form_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE icp_form_templates ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb;
ALTER TABLE icp_form_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Sync existing data from Portuguese columns to English columns
UPDATE icp_form_templates SET name = titulo WHERE name IS NULL AND titulo IS NOT NULL;
UPDATE icp_form_templates SET description = descricao WHERE description IS NULL AND descricao IS NOT NULL;
UPDATE icp_form_templates SET fields = campos WHERE fields = '[]'::jsonb AND campos != '[]'::jsonb;
UPDATE icp_form_templates SET is_active = ativo WHERE is_active IS NULL;

-- =====================================================================
-- 4. icp_responses - Frontend uses English names
--    Schema: respostas
--    Frontend: responses, completed_at
-- =====================================================================
ALTER TABLE icp_responses ADD COLUMN IF NOT EXISTS responses JSONB;
ALTER TABLE icp_responses ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Sync existing data
UPDATE icp_responses SET responses = respostas WHERE responses IS NULL AND respostas IS NOT NULL;

-- =====================================================================
-- 5. usuarios_financeiro - Missing columns
-- =====================================================================
ALTER TABLE usuarios_financeiro ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE usuarios_financeiro ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{}'::jsonb;

-- =====================================================================
-- 6. group_events - Frontend uses different column names
--    Schema: title, event_type, start_time, end_time, meet_link
--    Frontend: name, type, event_date, event_time, location, notes
-- =====================================================================
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS notes TEXT;

-- Sync existing data
UPDATE group_events SET name = title WHERE name IS NULL AND title IS NOT NULL;
UPDATE group_events SET type = event_type WHERE type IS NULL AND event_type IS NOT NULL;

-- =====================================================================
-- 7. group_event_participants - Missing frontend columns
-- =====================================================================
ALTER TABLE group_event_participants ADD COLUMN IF NOT EXISTS attendance_status TEXT;
ALTER TABLE group_event_participants ADD COLUMN IF NOT EXISTS participant_name TEXT;
ALTER TABLE group_event_participants ADD COLUMN IF NOT EXISTS participant_email TEXT;
ALTER TABLE group_event_participants ADD COLUMN IF NOT EXISTS participant_phone TEXT;
ALTER TABLE group_event_participants ADD COLUMN IF NOT EXISTS conversion_value NUMERIC DEFAULT 0;

-- Sync existing data
UPDATE group_event_participants SET participant_name = nome WHERE participant_name IS NULL AND nome IS NOT NULL;
UPDATE group_event_participants SET participant_email = email WHERE participant_email IS NULL AND email IS NOT NULL;
UPDATE group_event_participants SET participant_phone = telefone WHERE participant_phone IS NULL AND telefone IS NOT NULL;

-- =====================================================================
-- 8. transacoes_financeiras - Missing columns
-- =====================================================================
ALTER TABLE transacoes_financeiras ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE transacoes_financeiras ADD COLUMN IF NOT EXISTS fornecedor TEXT;
ALTER TABLE transacoes_financeiras ADD COLUMN IF NOT EXISTS referencia_id UUID;
ALTER TABLE transacoes_financeiras ADD COLUMN IF NOT EXISTS referencia_tipo TEXT;

-- =====================================================================
-- 9. leads - Missing lead_score_detalhado
-- =====================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_detalhado JSONB;

-- =====================================================================
-- 10. mentorados - Frontend uses 'nome' and 'whatsapp' aliases
-- =====================================================================
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Sync existing data
UPDATE mentorados SET nome = nome_completo WHERE nome IS NULL AND nome_completo IS NOT NULL;
UPDATE mentorados SET whatsapp = telefone WHERE whatsapp IS NULL AND telefone IS NOT NULL;

-- =====================================================================
-- 11. closer_atividades - Frontend uses 'closer_atividades' but schema
--     has 'closers_atividades'. Create a VIEW alias.
-- =====================================================================
CREATE OR REPLACE VIEW closer_atividades AS SELECT * FROM closers_atividades;

-- =====================================================================
-- 12. calendar_events - Frontend uses start_datetime/end_datetime
--     but schema has start_time/end_time
-- =====================================================================
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS sdr_id UUID;

-- Sync existing data
UPDATE calendar_events SET start_datetime = start_time WHERE start_datetime IS NULL AND start_time IS NOT NULL;
UPDATE calendar_events SET end_datetime = end_time WHERE end_datetime IS NULL AND end_time IS NOT NULL;

-- =====================================================================
-- 13. appointments - Missing created_by column
-- =====================================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by UUID;

-- =====================================================================
-- Done!
-- =====================================================================
SELECT 'Schema fixes applied successfully!' AS result;
