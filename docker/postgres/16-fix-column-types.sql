-- =====================================================================
-- Migration 16: Fix column type mismatches
-- =====================================================================

-- leads.lead_score_detalhado: was JSONB in schema, seed inserts INTEGER
ALTER TABLE leads ALTER COLUMN lead_score_detalhado TYPE INTEGER USING 0;

-- kanban_tasks.tags: was TEXT[], seed inserts '[]'::jsonb — drop and recreate
ALTER TABLE kanban_tasks DROP COLUMN IF EXISTS tags;
ALTER TABLE kanban_tasks ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;

DO $$ BEGIN RAISE NOTICE 'Migration 16 complete — column types fixed'; END $$;
