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
-- 14. kanban_boards - Missing type, owner_id, is_active
-- =====================================================================
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'geral';
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Sync existing data
UPDATE kanban_boards SET owner_id = user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;

-- =====================================================================
-- 15. kanban_columns - Frontend uses 'position' but schema has 'column_order'
-- =====================================================================
ALTER TABLE kanban_columns ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE kanban_columns ADD COLUMN IF NOT EXISTS wip_limit INTEGER;

-- Sync existing data
UPDATE kanban_columns SET position = column_order WHERE position = 0 AND column_order != 0;

-- =====================================================================
-- 16. kanban_tasks - Missing frontend columns
-- =====================================================================
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS assigned_to_email TEXT;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC DEFAULT 0;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Sync existing data
UPDATE kanban_tasks SET position = task_order WHERE position = 0 AND task_order != 0;

-- =====================================================================
-- 17. Kanban functions - Frontend expects different signatures/return formats
-- =====================================================================

-- Drop old signatures so we can recreate with new params
DROP FUNCTION IF EXISTS get_kanban_board_data(UUID);
DROP FUNCTION IF EXISTS initialize_default_kanban(UUID, UUID);
DROP FUNCTION IF EXISTS move_kanban_task(UUID, UUID, INTEGER);

-- initialize_default_kanban: frontend passes p_organization_id + p_user_email (not UUID)
CREATE OR REPLACE FUNCTION initialize_default_kanban(
    p_organization_id UUID,
    p_user_email TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, board_id UUID) AS $$
DECLARE
    v_board_id UUID;
BEGIN
    INSERT INTO kanban_boards (organization_id, name, type, is_active)
    VALUES (p_organization_id, 'Pipeline de Vendas', 'geral', true)
    RETURNING id INTO v_board_id;

    INSERT INTO kanban_columns (board_id, name, color, column_order, position) VALUES
        (v_board_id, 'Novo', '#3B82F6', 0, 0),
        (v_board_id, 'Contactado', '#8B5CF6', 1, 1),
        (v_board_id, 'Qualificado', '#F59E0B', 2, 2),
        (v_board_id, 'Proposta', '#10B981', 3, 3),
        (v_board_id, 'Fechado', '#22C55E', 4, 4),
        (v_board_id, 'Perdido', '#EF4444', 5, 5);

    RETURN QUERY SELECT true, v_board_id;
END;
$$ LANGUAGE plpgsql;

-- get_kanban_board_data: frontend passes p_board_id + p_user_email
-- expects data[0] = { board_info, columns_data, tasks_data }
CREATE OR REPLACE FUNCTION get_kanban_board_data(
    p_board_id UUID,
    p_user_email TEXT DEFAULT NULL
) RETURNS TABLE(board_info JSONB, columns_data JSONB, tasks_data JSONB) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT to_jsonb(b) FROM kanban_boards b WHERE b.id = p_board_id),
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', col.id,
                    'name', col.name,
                    'color', col.color,
                    'position', COALESCE(col.position, col.column_order),
                    'wip_limit', col.wip_limit,
                    'task_count', (SELECT count(*) FROM kanban_tasks t WHERE t.column_id = col.id)
                ) ORDER BY COALESCE(col.position, col.column_order)
            )
            FROM kanban_columns col WHERE col.board_id = p_board_id),
            '[]'::jsonb
        ),
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'title', t.title,
                    'description', t.description,
                    'column_id', t.column_id,
                    'board_id', t.board_id,
                    'assigned_to_email', t.assigned_to_email,
                    'created_by_email', t.created_by_email,
                    'priority', t.priority,
                    'due_date', t.due_date,
                    'estimated_hours', t.estimated_hours,
                    'actual_hours', COALESCE(t.actual_hours, 0),
                    'position', COALESCE(t.position, t.task_order),
                    'tags', COALESCE(t.tags, '{}'),
                    'created_at', t.created_at,
                    'updated_at', t.updated_at
                ) ORDER BY COALESCE(t.position, t.task_order)
            )
            FROM kanban_tasks t WHERE t.board_id = p_board_id),
            '[]'::jsonb
        );
END;
$$ LANGUAGE plpgsql;

-- move_kanban_task: frontend passes p_task_id, p_new_column_id, p_new_position, p_user_email
CREATE OR REPLACE FUNCTION move_kanban_task(
    p_task_id UUID,
    p_new_column_id UUID,
    p_new_position INTEGER,
    p_user_email TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE kanban_tasks
    SET column_id = p_new_column_id,
        task_order = p_new_position,
        position = p_new_position,
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 18. closers - Frontend uses 'nome' alias in some pages
-- =====================================================================
ALTER TABLE closers ADD COLUMN IF NOT EXISTS nome TEXT;
UPDATE closers SET nome = nome_completo WHERE nome IS NULL AND nome_completo IS NOT NULL;

-- =====================================================================
-- 19. video_modules - Frontend uses 'order_index' but schema has 'module_order'
-- =====================================================================
ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
UPDATE video_modules SET order_index = module_order WHERE order_index = 0 AND module_order != 0;

-- =====================================================================
-- 20. video_access_control - Frontend uses 'has_access' but schema has 'is_active'
--     Also frontend uses 'granted_by' as TEXT (email) but schema has UUID
-- =====================================================================
ALTER TABLE video_access_control ADD COLUMN IF NOT EXISTS has_access BOOLEAN DEFAULT true;
UPDATE video_access_control SET has_access = is_active WHERE has_access IS NULL;

-- =====================================================================
-- 21. dividas - Frontend uses 'mentorado_nome' denormalized column
-- =====================================================================
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS mentorado_nome TEXT;
-- Sync from mentorados
UPDATE dividas d SET mentorado_nome = m.nome_completo
FROM mentorados m WHERE d.mentorado_id = m.id AND d.mentorado_nome IS NULL;

-- =====================================================================
-- 22. calendar_events - start_time is NOT NULL but frontend sends start_datetime
--     Need to allow NULL on start_time and auto-populate via trigger
-- =====================================================================
ALTER TABLE calendar_events ALTER COLUMN start_time DROP NOT NULL;

-- Create trigger to sync start_datetime → start_time on insert/update
CREATE OR REPLACE FUNCTION sync_calendar_event_times()
RETURNS TRIGGER AS $$
BEGIN
    -- If start_datetime is set but start_time is not, copy it
    IF NEW.start_datetime IS NOT NULL AND NEW.start_time IS NULL THEN
        NEW.start_time := NEW.start_datetime;
    END IF;
    -- If end_datetime is set but end_time is not, copy it
    IF NEW.end_datetime IS NOT NULL AND NEW.end_time IS NULL THEN
        NEW.end_time := NEW.end_datetime;
    END IF;
    -- Reverse: if start_time is set but start_datetime is not
    IF NEW.start_time IS NOT NULL AND NEW.start_datetime IS NULL THEN
        NEW.start_datetime := NEW.start_time;
    END IF;
    IF NEW.end_time IS NOT NULL AND NEW.end_datetime IS NULL THEN
        NEW.end_datetime := NEW.end_time;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_calendar_times ON calendar_events;
CREATE TRIGGER trg_sync_calendar_times
    BEFORE INSERT OR UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION sync_calendar_event_times();

-- =====================================================================
-- 23. user_settings - Frontend uses 'calendar_settings' column
-- =====================================================================
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS calendar_settings JSONB;

-- =====================================================================
-- 24. lead_followup_sequences - Ensure criterios_ativacao accepts objects
--     (already JSONB, but add missing frontend columns)
-- =====================================================================
ALTER TABLE lead_followup_sequences ADD COLUMN IF NOT EXISTS created_by_email TEXT;

-- =====================================================================
-- 25. exercise_checkpoints - Frontend uses 'order_index'
-- =====================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exercise_checkpoints') THEN
        EXECUTE 'ALTER TABLE exercise_checkpoints ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0';
    END IF;
END $$;

-- =====================================================================
-- Done!
-- =====================================================================
SELECT 'Schema fixes applied successfully!' AS result;
