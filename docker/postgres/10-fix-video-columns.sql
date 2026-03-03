-- ============================================================
-- 10 - Fix missing columns for video features
-- Run: docker exec -i cssystem-db psql -U postgres -d cssystem < docker/postgres/10-fix-video-columns.sql
-- ============================================================

-- lesson_notes: frontend sends note_text, note_type, is_private
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS note_text TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS note_type TEXT DEFAULT 'text';
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT true;

-- video_form_templates: frontend sends name, form_type, trigger_event, questions, is_active
ALTER TABLE video_form_templates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE video_form_templates ADD COLUMN IF NOT EXISTS form_type TEXT;
ALTER TABLE video_form_templates ADD COLUMN IF NOT EXISTS trigger_event TEXT;
ALTER TABLE video_form_templates ADD COLUMN IF NOT EXISTS questions JSONB;
ALTER TABLE video_form_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- video_form_responses: frontend sends nps_score, satisfaction_score, feedback_text, responses, updated_at
ALTER TABLE video_form_responses ADD COLUMN IF NOT EXISTS nps_score INTEGER;
ALTER TABLE video_form_responses ADD COLUMN IF NOT EXISTS satisfaction_score INTEGER;
ALTER TABLE video_form_responses ADD COLUMN IF NOT EXISTS feedback_text TEXT;
ALTER TABLE video_form_responses ADD COLUMN IF NOT EXISTS responses JSONB;
ALTER TABLE video_form_responses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
