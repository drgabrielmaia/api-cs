-- 26-event-closer.sql
-- Add closer_id column to group_events for linking closers to events

ALTER TABLE group_events ADD COLUMN IF NOT EXISTS closer_id UUID REFERENCES closers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_group_events_closer ON group_events(closer_id);
