-- =====================================================================
-- Migration 17: FINAL comprehensive schema alignment with Supabase
-- Adds ALL missing columns for every table in the seed
-- =====================================================================

-- =====================================================================
-- 1. MENTORADOS - many missing columns
-- =====================================================================
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS nivel_experiencia TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS area_atuacao TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS faturamento_inicial DECIMAL(10,2);
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS faturamento_meta DECIMAL(10,2);
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS status_mentoria TEXT DEFAULT 'ativo';
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS score_engajamento INTEGER DEFAULT 0;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS ultima_atividade TIMESTAMPTZ;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS dados_pessoais JSONB DEFAULT '{}'::jsonb;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS is_churned BOOLEAN DEFAULT FALSE;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS churn_date TIMESTAMPTZ;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS churn_type TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS churn_reason TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS pix_chave TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS pix_tipo TEXT;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS icp_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS icp_response_id UUID;

-- =====================================================================
-- 2. VIDEO_MODULES - column name differences + missing
-- Schema has: module_order, is_published, cover_image_url
-- Seed uses: order_index, is_active, thumbnail_url
-- =====================================================================
ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
-- Copy existing data to new columns if they exist
UPDATE video_modules SET order_index = module_order WHERE order_index = 0 AND module_order IS NOT NULL;
UPDATE video_modules SET is_active = is_published WHERE is_active = TRUE AND is_published IS NOT NULL;

-- =====================================================================
-- 3. VIDEO_LESSONS - column name differences + missing
-- Schema has: video_url, video_id, duration_seconds, lesson_order, is_published, thumbnail_url
-- Seed uses: panda_video_embed_url, panda_video_id, duration_minutes, order_index, is_active + extras
-- =====================================================================
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS panda_video_embed_url TEXT;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS panda_video_id TEXT;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS pdf_size_bytes BIGINT;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS pdf_uploaded_at TIMESTAMPTZ;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS replaced_by UUID;
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS archive_reason TEXT;
-- Copy existing data
UPDATE video_lessons SET panda_video_embed_url = video_url WHERE panda_video_embed_url IS NULL AND video_url IS NOT NULL;
UPDATE video_lessons SET panda_video_id = video_id WHERE panda_video_id IS NULL AND video_id IS NOT NULL;
UPDATE video_lessons SET order_index = lesson_order WHERE order_index = 0 AND lesson_order IS NOT NULL;
UPDATE video_lessons SET is_active = is_published WHERE is_active = TRUE AND is_published IS NOT NULL;

-- =====================================================================
-- 4. Create missing tables referenced by seed DELETEs
-- =====================================================================
CREATE TABLE IF NOT EXISTS mentorado_metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    titulo TEXT,
    descricao TEXT,
    tipo TEXT,
    valor_meta DECIMAL(10,2),
    valor_atual DECIMAL(10,2) DEFAULT 0,
    unidade TEXT,
    status TEXT DEFAULT 'em_andamento',
    data_inicio DATE,
    data_fim DATE,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mentorado_evolucao_financeira (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    mes INTEGER,
    ano INTEGER,
    faturamento DECIMAL(10,2) DEFAULT 0,
    despesas DECIMAL(10,2) DEFAULT 0,
    lucro DECIMAL(10,2) DEFAULT 0,
    numero_clientes INTEGER DEFAULT 0,
    ticket_medio DECIMAL(10,2) DEFAULT 0,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT,
    contact_name TEXT,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN RAISE NOTICE 'Migration 17 complete — ALL schema mismatches resolved'; END $$;
