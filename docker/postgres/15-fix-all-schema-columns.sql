-- =====================================================================
-- Migration 15: Fix ALL remaining schema mismatches with Supabase data
-- =====================================================================

-- =====================================================================
-- 1. LEADS - missing columns
-- =====================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score_detalhado INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperatura_calculada TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS prioridade_nivel TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER;

-- =====================================================================
-- 2. PONTUACAO_MENTORADOS - criado_por is UUID but seed has TEXT values
-- =====================================================================
ALTER TABLE pontuacao_mentorados ALTER COLUMN criado_por TYPE TEXT USING criado_por::TEXT;

-- =====================================================================
-- 3. KANBAN_BOARDS - missing columns
-- =====================================================================
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'geral';
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- =====================================================================
-- 4. KANBAN_COLUMNS - rename column_order→position, add missing
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kanban_columns' AND column_name='column_order') THEN
    ALTER TABLE kanban_columns RENAME COLUMN column_order TO position;
  END IF;
END $$;
ALTER TABLE kanban_columns ADD COLUMN IF NOT EXISTS wip_limit INTEGER;
ALTER TABLE kanban_columns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE kanban_columns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================
-- 5. KANBAN_TASKS - rename + add missing columns
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kanban_tasks' AND column_name='assignee_id') THEN
    ALTER TABLE kanban_tasks RENAME COLUMN assignee_id TO assigned_to;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kanban_tasks' AND column_name='task_order') THEN
    ALTER TABLE kanban_tasks RENAME COLUMN task_order TO position;
  END IF;
END $$;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS assigned_to_email TEXT;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- =====================================================================
-- 6. CLOSERS - missing columns
-- =====================================================================
ALTER TABLE closers ADD COLUMN IF NOT EXISTS capacidade_maxima_leads INTEGER DEFAULT 50;
ALTER TABLE closers ADD COLUMN IF NOT EXISTS especialidade TEXT DEFAULT 'geral';
ALTER TABLE closers ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE closers ADD COLUMN IF NOT EXISTS comissao_indicacao_percentual DECIMAL(5,2) DEFAULT 0;
ALTER TABLE closers ADD COLUMN IF NOT EXISTS comissao_proprio_percentual DECIMAL(5,2) DEFAULT 0;
ALTER TABLE closers ADD COLUMN IF NOT EXISTS closer_level_id UUID;

-- =====================================================================
-- 7. DESPESAS_MENSAIS - missing column
-- =====================================================================
ALTER TABLE despesas_mensais ADD COLUMN IF NOT EXISTS data_vencimento DATE;

-- =====================================================================
-- 8. FORM_TEMPLATES - rename title→name, add missing columns
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_templates' AND column_name='title') THEN
    ALTER TABLE form_templates RENAME COLUMN title TO name;
  END IF;
END $$;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS form_type TEXT;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS style JSONB;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS lead_qualification JSONB;

DO $$ BEGIN RAISE NOTICE 'Migration 15 complete — ALL schema mismatches fixed'; END $$;
