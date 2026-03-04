-- =====================================================================
-- Migration 16: Fix column type mismatches
-- =====================================================================

-- leads.lead_score_detalhado: was JSONB in schema, seed inserts INTEGER
ALTER TABLE leads ALTER COLUMN lead_score_detalhado TYPE INTEGER USING 0;

-- kanban_tasks.tags: was TEXT[], seed inserts '[]'::jsonb
ALTER TABLE kanban_tasks ALTER COLUMN tags TYPE JSONB USING COALESCE(to_jsonb(tags), '[]'::jsonb);

DO $$ BEGIN RAISE NOTICE 'Migration 16 complete — column types fixed'; END $$;
