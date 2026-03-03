-- =====================================================================
-- Add missing columns + get_event_statistics function
-- =====================================================================

-- Add conversion_value column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'group_event_participants' AND column_name = 'conversion_value'
    ) THEN
        ALTER TABLE group_event_participants ADD COLUMN conversion_value NUMERIC DEFAULT 0;
    END IF;
END $$;

-- Event statistics function for calls-eventos page
CREATE OR REPLACE FUNCTION get_event_statistics(p_organization_id UUID)
RETURNS TABLE (
    total_events BIGINT,
    total_participants BIGINT,
    total_attendees BIGINT,
    attendance_rate NUMERIC,
    total_conversions BIGINT,
    conversion_rate NUMERIC,
    total_conversion_value NUMERIC,
    avg_conversion_value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM group_events WHERE organization_id = p_organization_id)::BIGINT AS total_events,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id)::BIGINT AS total_participants,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.attended = true)::BIGINT AS total_attendees,
        CASE
            WHEN (SELECT COUNT(*) FROM group_event_participants gep
                  JOIN group_events ge ON ge.id = gep.event_id
                  WHERE ge.organization_id = p_organization_id) = 0 THEN 0
            ELSE ROUND(
                (SELECT COUNT(*) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id AND gep.attended = true)::NUMERIC /
                (SELECT COUNT(*) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id)::NUMERIC * 100, 1)
        END AS attendance_rate,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.converted = true)::BIGINT AS total_conversions,
        CASE
            WHEN (SELECT COUNT(*) FROM group_event_participants gep
                  JOIN group_events ge ON ge.id = gep.event_id
                  WHERE ge.organization_id = p_organization_id) = 0 THEN 0
            ELSE ROUND(
                (SELECT COUNT(*) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id AND gep.converted = true)::NUMERIC /
                (SELECT COUNT(*) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id)::NUMERIC * 100, 1)
        END AS conversion_rate,
        COALESCE((SELECT SUM(COALESCE(gep.conversion_value, 0)) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.converted = true), 0) AS total_conversion_value,
        CASE
            WHEN (SELECT COUNT(*) FROM group_event_participants gep
                  JOIN group_events ge ON ge.id = gep.event_id
                  WHERE ge.organization_id = p_organization_id AND gep.converted = true) = 0 THEN 0
            ELSE ROUND(
                COALESCE((SELECT AVG(COALESCE(gep.conversion_value, 0)) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id AND gep.converted = true), 0), 2)
        END AS avg_conversion_value;
END;
$$ LANGUAGE plpgsql;
