-- ============================================================
-- 11 - Fix AI usage tracking + Grant all mentorados access
-- Run: docker exec -i cssystem-db psql -U postgres -d cssystem < docker/postgres/11-fix-ai-usage-and-access.sql
-- ALSO RUN IN SUPABASE SQL EDITOR (the ai_usage fix part)
-- ============================================================

-- =============================================
-- PART 1: Fix ai_usage table for token tracking
-- The code expects: mentorado_id, month_year, images_generated, chat_messages_sent
-- The schema has: user_id, organization_id, model, tokens_used, date, request_count
-- =============================================

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS mentorado_id UUID REFERENCES mentorados(id);
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS month_year TEXT;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS images_generated INTEGER DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS chat_messages_sent INTEGER DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS input_tokens_estimated INTEGER DEFAULT 0;
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS output_tokens_estimated INTEGER DEFAULT 0;

-- Create unique index for mentorado + month lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_mentorado_month
ON ai_usage (mentorado_id, month_year);

-- =============================================
-- PART 2: Grant ALL mentorados access to ALL video modules
-- Password: medicosderesultado
-- =============================================

-- Set password for all mentorados
UPDATE mentorados SET senha = 'medicosderesultado' WHERE senha IS NULL OR senha = '';
UPDATE mentorados SET senha = 'medicosderesultado';

-- Delete existing access records to avoid duplicates
DELETE FROM video_access_control;

-- Insert access for ALL mentorados x ALL modules
INSERT INTO video_access_control (mentorado_id, module_id, has_access, granted_at)
SELECT m.id, vm.id, true, NOW()
FROM mentorados m
CROSS JOIN video_modules vm
ON CONFLICT DO NOTHING;

-- Verify
SELECT 'Mentorados with password set:' AS info, COUNT(*) AS total FROM mentorados WHERE senha = 'medicosderesultado';
SELECT 'Access records created:' AS info, COUNT(*) AS total FROM video_access_control WHERE has_access = true;
SELECT 'AI usage columns added:' AS info, COUNT(*) AS total FROM information_schema.columns WHERE table_name = 'ai_usage' AND column_name IN ('mentorado_id', 'month_year', 'images_generated', 'chat_messages_sent');
