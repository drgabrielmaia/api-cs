-- =====================================================================
-- Migration 18: Fix video_lessons.version column type
-- Schema has INTEGER DEFAULT 1, but Supabase seed inserts TEXT 'v1.0'
-- =====================================================================

ALTER TABLE video_lessons ALTER COLUMN version TYPE TEXT USING version::TEXT;
ALTER TABLE video_lessons ALTER COLUMN version SET DEFAULT 'v1.0';

DO $$ BEGIN RAISE NOTICE 'Migration 18 complete — video_lessons.version changed to TEXT'; END $$;
