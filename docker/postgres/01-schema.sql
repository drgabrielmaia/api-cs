-- =====================================================================
-- CSSYSTEM - COMPLETE DATABASE SCHEMA
-- Generated: 2026-03-02
-- Target: PostgreSQL 15+ (Docker)
-- Total: ~115 tables, 10 views, 38+ RPCs, 3 storage buckets
-- =====================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 0. UTILITY FUNCTIONS
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. AUTH & ORGANIZATIONS
-- =====================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_email TEXT,
    admin_phone TEXT,
    comissao_fixa_indicacao BIGINT DEFAULT 2000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    email TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_org_users_org ON organization_users(organization_id);
CREATE INDEX idx_org_users_user ON organization_users(user_id);
CREATE INDEX idx_org_users_email ON organization_users(email);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE,
    nome_completo TEXT,
    telefone TEXT,
    cpf TEXT UNIQUE,
    pix_key TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    tipo_usuario TEXT CHECK (tipo_usuario IN ('admin', 'closer', 'sdr', 'social_seller', 'mentorado')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_org ON profiles(organization_id);

CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_settings_user ON user_settings(user_id);

CREATE TABLE IF NOT EXISTS usuarios_financeiro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT,
    role TEXT DEFAULT 'viewer',
    ativo BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    resource TEXT,
    resource_id UUID,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user ON security_audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON security_audit_logs(action);

-- =====================================================================
-- 2. MENTORADOS (STUDENTS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS mentorados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    cpf TEXT,
    rg TEXT,
    crm TEXT,
    data_nascimento DATE,
    endereco TEXT,
    endereco_completo TEXT,
    genero TEXT,
    especialidade TEXT,

    -- Professional info
    profissao TEXT,
    formacao_academica TEXT,
    renda_mensal DECIMAL(10,2),
    objetivo_principal TEXT,
    tempo_atuacao TEXT,
    experiencia_vendas TEXT,
    canais_venda TEXT,
    publico_alvo TEXT,
    ticket_medio DECIMAL(10,2),
    faturamento_mensal DECIMAL(10,2),
    principais_desafios TEXT,

    -- Mentorship status
    estado_entrada TEXT DEFAULT 'ativo',
    estado_atual TEXT DEFAULT 'ativo',
    data_entrada DATE DEFAULT CURRENT_DATE,
    data_inicio_mentoria DATE,
    origem_conhecimento TEXT,
    turma TEXT,

    -- Auth
    password_hash TEXT,
    status_login TEXT DEFAULT 'ativo' CHECK (status_login IN ('ativo', 'inativo', 'bloqueado')),

    -- Gamification
    pontuacao_total INTEGER DEFAULT 0,
    porcentagem_comissao DECIMAL(5,2) DEFAULT 0,

    -- Churn/exclusion
    excluido BOOLEAN DEFAULT false,
    motivo_exclusao TEXT,
    data_exclusao TIMESTAMPTZ,

    -- Relations
    lead_id UUID,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mentorados_email ON mentorados(email);
CREATE INDEX idx_mentorados_org ON mentorados(organization_id);
CREATE INDEX idx_mentorados_status ON mentorados(status_login, estado_atual);

CREATE TABLE IF NOT EXISTS mentorado_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    tempo_mentoria TEXT,
    faturamento_antes DECIMAL(10,2),
    faturamento_atual DECIMAL(10,2),
    maior_conquista TEXT,
    principal_dificuldade TEXT,
    expectativas_futuras TEXT,
    recomendaria_mentoria BOOLEAN DEFAULT true,
    nota_satisfacao INTEGER,
    sugestoes_melhoria TEXT,
    objetivos_proximos_meses TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mentorado_atividades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo_atividade TEXT,
    descricao TEXT,
    data_atividade TIMESTAMPTZ DEFAULT NOW(),
    pontos INTEGER DEFAULT 0,
    meta_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pontuacao_mentorados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    tipo_acao TEXT NOT NULL,
    pontos INTEGER NOT NULL DEFAULT 0,
    descricao TEXT,
    data_acao TIMESTAMPTZ DEFAULT NOW(),
    criado_por UUID,
    meta_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pontuacao_mentorado ON pontuacao_mentorados(mentorado_id);

CREATE TABLE IF NOT EXISTS metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    titulo TEXT,
    descricao TEXT,
    valor_meta DECIMAL(10,2),
    valor_atual DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'em_andamento',
    data_inicio DATE,
    data_fim DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT,
    respostas JSONB,
    nota_geral INTEGER,
    observacoes TEXT,
    data_checkin TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_checkins_mentorado ON checkins(mentorado_id);

CREATE TABLE IF NOT EXISTS icp_form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    titulo TEXT NOT NULL,
    descricao TEXT,
    campos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS icp_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    template_id UUID REFERENCES icp_form_templates(id),
    organization_id UUID REFERENCES organizations(id),
    respostas JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 3. VIDEO / LESSON PLATFORM
-- =====================================================================

CREATE TABLE IF NOT EXISTS module_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    color TEXT,
    display_order INTEGER DEFAULT 0,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    preview_video_url TEXT,
    module_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    featured BOOLEAN DEFAULT false,
    tags TEXT[],
    difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    average_rating DECIMAL(3,2),
    total_ratings INTEGER DEFAULT 0,
    category_id UUID REFERENCES module_categories(id),
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_video_modules_org ON video_modules(organization_id);

CREATE TABLE IF NOT EXISTS video_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES video_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    video_id TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    lesson_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    is_current BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES video_lessons(id),
    pdf_url TEXT,
    pdf_filename TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_video_lessons_module ON video_lessons(module_id);

CREATE TABLE IF NOT EXISTS video_access_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES video_modules(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mentorado_id, module_id)
);
CREATE INDEX idx_vac_mentorado ON video_access_control(mentorado_id);
CREATE INDEX idx_vac_module ON video_access_control(module_id);

CREATE TABLE IF NOT EXISTS video_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
    progress_seconds INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    last_watched_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mentorado_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
    module_id UUID REFERENCES video_modules(id),
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    watch_time_seconds INTEGER DEFAULT 0,
    last_position_seconds INTEGER DEFAULT 0,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mentorado_id, lesson_id)
);
CREATE INDEX idx_lesson_progress_mentorado ON lesson_progress(mentorado_id);

CREATE TABLE IF NOT EXISTS lesson_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    tipo TEXT DEFAULT 'multipla_escolha',
    opcoes JSONB,
    resposta_correta TEXT,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercise_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES lesson_exercises(id) ON DELETE CASCADE,
    resposta TEXT,
    resposta_json JSONB,
    correto BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
    content TEXT,
    timestamp_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS module_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES video_modules(id) ON DELETE CASCADE,
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 0 AND rating <= 10),
    feedback TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(module_id, mentorado_id)
);

CREATE TABLE IF NOT EXISTS continue_watching (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES video_lessons(id) ON DELETE CASCADE,
    last_position_seconds INTEGER DEFAULT 0,
    last_watched_at TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID REFERENCES organizations(id),
    UNIQUE(mentorado_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS video_form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID REFERENCES video_modules(id),
    title TEXT,
    description TEXT,
    campos JSONB,
    tipo TEXT DEFAULT 'nps',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES video_form_templates(id),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    module_id UUID REFERENCES video_modules(id),
    lesson_id UUID REFERENCES video_lessons(id),
    respostas JSONB,
    rating INTEGER,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_learning_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_value DECIMAL(10,2),
    current_value DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    deadline DATE,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES video_learning_goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_value DECIMAL(10,2),
    current_value DECIMAL(10,2) DEFAULT 0,
    target_date DATE,
    completed_date TIMESTAMPTZ,
    is_completed BOOLEAN DEFAULT false,
    progress DECIMAL(5,2) DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- View: continue_watching_details
CREATE OR REPLACE VIEW continue_watching_details AS
SELECT
    cw.id, cw.mentorado_id, cw.lesson_id, cw.last_position_seconds, cw.last_watched_at,
    vl.title AS lesson_title, vl.video_url, vl.duration_seconds, vl.lesson_order,
    vm.id AS module_id, vm.title AS module_title, vm.cover_image_url, vm.description AS module_description,
    m.nome_completo AS mentorado_name,
    CASE WHEN vl.duration_seconds > 0
         THEN ROUND((cw.last_position_seconds::DECIMAL / vl.duration_seconds) * 100, 1)
         ELSE 0 END AS progress_percentage
FROM continue_watching cw
JOIN video_lessons vl ON vl.id = cw.lesson_id
JOIN video_modules vm ON vm.id = vl.module_id
JOIN mentorados m ON m.id = cw.mentorado_id;

-- =====================================================================
-- 4. LEADS / CRM
-- =====================================================================

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo TEXT,
    email TEXT,
    telefone TEXT,
    empresa TEXT,
    cargo TEXT,

    -- Source / Attribution
    origem TEXT,
    origem_detalhada TEXT,
    fonte_detalhada TEXT,
    fonte_referencia TEXT,
    campanha_origem TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    indicado_por TEXT,

    -- Status & Scoring
    status TEXT DEFAULT 'novo',
    temperatura TEXT,
    lead_score INTEGER DEFAULT 0,
    probabilidade_compra DECIMAL(5,2),
    prioridade TEXT,
    nivel_interesse INTEGER,
    urgencia_compra TEXT,
    tags TEXT[],
    perfil_comportamental TEXT,

    -- Sales pipeline
    valor_potencial DECIMAL(10,2),
    valor_estimado DECIMAL(10,2),
    valor_vendido DECIMAL(10,2),
    valor_venda DECIMAL(10,2),
    valor_arrecadado DECIMAL(10,2),
    data_primeiro_contato TIMESTAMPTZ,
    data_prevista_fechamento DATE,
    data_venda DATE,
    data_fechamento DATE,
    convertido_em TIMESTAMPTZ,
    status_updated_at TIMESTAMPTZ,
    last_interaction_date TIMESTAMPTZ,

    -- Qualification details
    dor_principal TEXT,
    orcamento_disponivel TEXT,
    decisor_principal TEXT,
    objetivo_principal TEXT,
    objecoes_principais TEXT,
    produto_interesse TEXT,
    concorrente TEXT,
    motivo_nao_fechou TEXT,
    desistiu BOOLEAN DEFAULT false,

    -- Contact preferences
    periodo_melhor_contato TEXT,
    canal_preferido TEXT,

    -- Sales actions
    proxima_acao TEXT,
    responsavel_vendas TEXT,
    observacoes TEXT,

    -- Follow-up
    follow_up_status TEXT,
    follow_up_data TIMESTAMPTZ,
    follow_up_observacoes TEXT,
    next_followup_date TIMESTAMPTZ,

    -- Financial
    pix_key TEXT,
    pix_paid BOOLEAN DEFAULT false,
    pix_paid_at TIMESTAMPTZ,

    -- JSONB details
    call_details JSONB,
    call_history JSONB DEFAULT '[]'::jsonb,
    qualification_details JSONB,
    sales_details JSONB,

    -- Referral / Commission
    mentorado_indicador_id UUID,
    comissao_id UUID,
    possui_comissao BOOLEAN DEFAULT false,
    referral_id UUID,
    commission_paid BOOLEAN DEFAULT false,

    -- Team assignment
    closer_id UUID,
    closer_atribuido_em TIMESTAMPTZ,
    closer_tipo TEXT,
    closer_observacoes TEXT,
    sdr_id UUID,
    sdr_atribuido_em TIMESTAMPTZ,
    sdr_qualificado_em TIMESTAMPTZ,
    sdr_observacoes TEXT,

    -- Organization
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leads_org ON leads(organization_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_closer ON leads(closer_id);
CREATE INDEX idx_leads_sdr ON leads(sdr_id);
CREATE INDEX idx_leads_temperatura ON leads(temperatura);
CREATE INDEX idx_leads_created ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    closer_id UUID,
    organization_id UUID REFERENCES organizations(id),
    tipo_nota TEXT DEFAULT 'geral',
    titulo TEXT,
    conteudo TEXT NOT NULL,
    visibilidade TEXT DEFAULT 'team',
    prioridade TEXT DEFAULT 'normal',
    lembrete_data TIMESTAMPTZ,
    lembrete_enviado BOOLEAN DEFAULT false,
    anexos TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id);

CREATE TABLE IF NOT EXISTS lead_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    campo TEXT,
    valor_anterior TEXT,
    valor_novo TEXT,
    alterado_por UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    action TEXT,
    details JSONB,
    performed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT,
    status TEXT DEFAULT 'pendente',
    data_agendada TIMESTAMPTZ,
    data_realizada TIMESTAMPTZ,
    descricao TEXT,
    resultado TEXT,
    observacoes TEXT,
    criado_por UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_followups_lead ON lead_followups(lead_id);

CREATE TABLE IF NOT EXISTS lead_followup_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    nome_sequencia TEXT NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    criterios_ativacao JSONB DEFAULT '{}'::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    pausar_fim_semana BOOLEAN DEFAULT true,
    pausar_feriados BOOLEAN DEFAULT false,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    horario_envio_inicio TEXT DEFAULT '09:00',
    horario_envio_fim TEXT DEFAULT '18:00',
    leads_atingidos INTEGER DEFAULT 0,
    taxa_resposta DECIMAL(5,2) DEFAULT 0,
    taxa_conversao DECIMAL(5,2) DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_followup_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES lead_followup_sequences(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    status TEXT DEFAULT 'active',
    step_atual INTEGER DEFAULT 0,
    proxima_execucao TIMESTAMPTZ,
    pausado_ate TIMESTAMPTZ,
    steps_executados JSONB DEFAULT '[]'::jsonb,
    respostas_recebidas JSONB DEFAULT '[]'::jsonb,
    total_touchpoints INTEGER DEFAULT 0,
    data_resposta TIMESTAMPTZ,
    converteu BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_followup_exec_lead ON lead_followup_executions(lead_id);
CREATE INDEX idx_followup_exec_next ON lead_followup_executions(proxima_execucao);

CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT,
    status TEXT DEFAULT 'pendente',
    data_prevista TIMESTAMPTZ,
    data_realizada TIMESTAMPTZ,
    mensagem TEXT,
    canal TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_qualification_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    closer_id UUID,
    organization_id UUID REFERENCES organizations(id),

    -- BANT
    budget_confirmado BOOLEAN DEFAULT false,
    budget_valor_disponivel DECIMAL(10,2),
    budget_fonte TEXT,
    authority_nivel TEXT,
    authority_pessoas_envolvidas JSONB,
    authority_processo_aprovacao TEXT,
    need_dor_principal TEXT,
    need_consequencias_nao_resolver TEXT,
    need_tentativas_anteriores TEXT,
    need_urgencia_score INTEGER,
    timeline_meta_implementacao TEXT,
    timeline_fatores_urgencia TEXT[],
    timeline_restricoes TEXT[],

    -- Current situation
    situacao_atual TEXT,
    solucao_atual TEXT,
    satisfacao_solucao_atual INTEGER,
    concorrentes_considerados TEXT[],
    nossa_vantagem_percebida TEXT,
    principais_objecoes TEXT[],

    -- Behavioral
    estilo_comunicacao TEXT,
    gatilhos_motivacionais TEXT[],
    medos_preocupacoes TEXT[],

    -- Company info
    empresa_nome TEXT,
    empresa_tamanho TEXT,
    empresa_setor TEXT,
    empresa_faturamento DECIMAL(10,2),
    empresa_num_funcionarios INTEGER,
    cargo_lead TEXT,
    nivel_hierarquico TEXT,

    -- Scores
    qualification_score INTEGER DEFAULT 0,
    qualification_details JSONB DEFAULT '{}'::jsonb,
    data_qualificacao TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_qual_lead ON lead_qualification_details(lead_id);

CREATE TABLE IF NOT EXISTS dividas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id),
    descricao TEXT,
    valor_total DECIMAL(10,2),
    valor_pago DECIMAL(10,2) DEFAULT 0,
    valor_restante DECIMAL(10,2),
    status TEXT DEFAULT 'pendente',
    data_vencimento DATE,
    parcelas INTEGER DEFAULT 1,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    divida_id UUID REFERENCES dividas(id) ON DELETE CASCADE,
    valor DECIMAL(10,2) NOT NULL,
    data_pagamento DATE,
    metodo TEXT,
    comprovante_url TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kanban
CREATE TABLE IF NOT EXISTS kanban_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    column_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT,
    due_date DATE,
    assignee_id UUID,
    task_order INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 5. CLOSERS / SALES TEAM
-- =====================================================================

CREATE TABLE IF NOT EXISTS closers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    cpf VARCHAR(14),
    rg VARCHAR(20),
    data_nascimento DATE,
    endereco TEXT,
    password_hash VARCHAR(255),
    status_login VARCHAR(20) DEFAULT 'ativo' CHECK (status_login IN ('ativo', 'inativo', 'bloqueado')),
    tipo_closer VARCHAR(50) DEFAULT 'sdr' CHECK (tipo_closer IN ('sdr', 'closer', 'closer_senior', 'manager')),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    data_contratacao DATE,
    data_desligamento DATE,
    status_contrato VARCHAR(20) DEFAULT 'ativo' CHECK (status_contrato IN ('ativo', 'inativo', 'ferias', 'desligado')),
    meta_mensal DECIMAL(10,2) DEFAULT 0,
    comissao_percentual DECIMAL(5,2) DEFAULT 5.00,
    total_vendas INTEGER DEFAULT 0,
    total_leads_atendidos INTEGER DEFAULT 0,
    conversao_rate DECIMAL(5,2) DEFAULT 0,
    pontuacao_total INTEGER DEFAULT 0,
    observacoes TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    horario_trabalho JSONB DEFAULT '{"inicio": "09:00", "fim": "18:00"}'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_closers_email ON closers(email);
CREATE INDEX idx_closers_org ON closers(organization_id);

CREATE TABLE IF NOT EXISTS closers_vendas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    data_venda DATE NOT NULL,
    valor_venda DECIMAL(10,2) NOT NULL,
    tipo_venda VARCHAR(50) DEFAULT 'mentoria',
    status_venda VARCHAR(20) DEFAULT 'confirmada',
    comissao_percentual DECIMAL(5,2) NOT NULL,
    valor_comissao DECIMAL(10,2) NOT NULL,
    status_pagamento VARCHAR(20) DEFAULT 'pendente',
    data_pagamento DATE,
    observacoes TEXT,
    fonte_lead VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closers_metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
    ano INTEGER NOT NULL CHECK (ano >= 2024),
    meta_vendas_quantidade INTEGER DEFAULT 0,
    meta_vendas_valor DECIMAL(10,2) DEFAULT 0,
    meta_leads_atendidos INTEGER DEFAULT 0,
    meta_conversao_rate DECIMAL(5,2) DEFAULT 0,
    vendas_realizadas INTEGER DEFAULT 0,
    valor_realizado DECIMAL(10,2) DEFAULT 0,
    leads_atendidos INTEGER DEFAULT 0,
    conversao_realizada DECIMAL(5,2) DEFAULT 0,
    percentual_atingimento DECIMAL(5,2) DEFAULT 0,
    bonus_atingimento DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(closer_id, mes, ano)
);

CREATE TABLE IF NOT EXISTS closers_atividades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo_atividade VARCHAR(50) NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE SET NULL,
    descricao TEXT,
    duracao_minutos INTEGER,
    resultado VARCHAR(50),
    proxima_acao VARCHAR(255),
    data_proxima_acao DATE,
    data_atividade TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closers_dashboard_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    access_time TIMESTAMPTZ DEFAULT NOW(),
    session_duration_minutes INTEGER,
    pages_visited JSONB DEFAULT '[]'::jsonb,
    device_type VARCHAR(20),
    browser VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closer_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME,
    end_time TIME,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closer_schedule_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    slot_duration_minutes INTEGER DEFAULT 30,
    break_between_slots INTEGER DEFAULT 15,
    max_slots_per_day INTEGER DEFAULT 10,
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closer_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    min_score INTEGER DEFAULT 0,
    max_score INTEGER,
    benefits JSONB,
    color TEXT,
    icon TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sdrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    nome_completo TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
    meta_qualificacao_mensal INTEGER DEFAULT 50,
    total_leads_qualificados INTEGER DEFAULT 0,
    taxa_qualificacao DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    nome_completo TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    instagram_handle TEXT,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'suspenso')),
    total_indicacoes INTEGER DEFAULT 0,
    total_vendas_geradas INTEGER DEFAULT 0,
    valor_total_gerado BIGINT DEFAULT 0,
    comissao_total_recebida BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Closer study materials
CREATE TABLE IF NOT EXISTS closer_material_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    display_order INTEGER DEFAULT 0,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closer_study_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES closer_material_categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    content_type TEXT,
    content_url TEXT,
    content_body TEXT,
    difficulty TEXT,
    duration_minutes INTEGER,
    display_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS closer_material_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES closer_study_materials(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(closer_id, material_id)
);

CREATE TABLE IF NOT EXISTS closer_material_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES closer_study_materials(id) ON DELETE CASCADE,
    granted_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(closer_id, material_id)
);

CREATE TABLE IF NOT EXISTS closer_material_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID NOT NULL REFERENCES closers(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES closer_study_materials(id) ON DELETE CASCADE,
    interaction_type TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- View: v_closer_agenda
CREATE OR REPLACE VIEW v_closer_agenda AS
SELECT
    a.id, a.closer_id, a.lead_id,
    a.data_atividade, a.tipo_atividade, a.descricao, a.resultado,
    l.nome_completo AS lead_nome, l.telefone AS lead_telefone
FROM closers_atividades a
LEFT JOIN leads l ON l.id = a.lead_id
ORDER BY a.data_atividade DESC;

-- =====================================================================
-- 6. SCHEDULING / CALENDAR
-- =====================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    all_day BOOLEAN DEFAULT false,
    type TEXT DEFAULT 'call',
    status TEXT DEFAULT 'scheduled',
    location TEXT,
    meet_link TEXT,
    color TEXT,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE SET NULL,
    closer_id UUID,
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_org ON calendar_events(organization_id);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closer_id UUID REFERENCES closers(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    calendar_event_id UUID REFERENCES calendar_events(id),
    title TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled',
    type TEXT DEFAULT 'call',
    notes TEXT,
    meet_link TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    closer_id UUID REFERENCES closers(id),
    lead_id UUID REFERENCES leads(id),
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT DEFAULT 'call',
    titulo TEXT,
    descricao TEXT,
    duracao_minutos INTEGER DEFAULT 30,
    ativo BOOLEAN DEFAULT true,
    usado BOOLEAN DEFAULT false,
    expira_em TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agendamento_links_token ON agendamento_links(token);

CREATE TABLE IF NOT EXISTS agenda_configuracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    horario_inicio TEXT DEFAULT '09:00',
    horario_fim TEXT DEFAULT '18:00',
    duracao_slot INTEGER DEFAULT 30,
    dias_disponiveis INTEGER[] DEFAULT '{1,2,3,4,5}',
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agenda_id UUID,
    lead_id UUID REFERENCES leads(id),
    nome TEXT,
    email TEXT,
    telefone TEXT,
    data_hora TIMESTAMPTZ NOT NULL,
    duracao_minutos INTEGER DEFAULT 30,
    status TEXT DEFAULT 'agendado',
    observacoes TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_links_personalizados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    slug TEXT UNIQUE,
    titulo TEXT,
    descricao TEXT,
    duracao_minutos INTEGER DEFAULT 30,
    ativo BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- View
CREATE OR REPLACE VIEW view_agenda_estatisticas AS
SELECT
    organization_id,
    COUNT(*) AS total_agendamentos,
    COUNT(*) FILTER (WHERE status = 'agendado') AS agendados,
    COUNT(*) FILTER (WHERE status = 'realizado') AS realizados,
    COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados
FROM agendamentos
GROUP BY organization_id;

-- =====================================================================
-- 7. FORMS / SURVEYS
-- =====================================================================

CREATE TABLE IF NOT EXISTS formularios_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    formulario TEXT,
    formulario_id TEXT,
    resposta TEXT,
    resposta_json JSONB,
    data_envio TIMESTAMPTZ DEFAULT NOW(),
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_form_resp_mentorado ON formularios_respostas(mentorado_id);
CREATE INDEX idx_form_resp_formulario ON formularios_respostas(formulario);

CREATE TABLE IF NOT EXISTS formularios_analises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    formulario_id TEXT,
    mentorado_id UUID REFERENCES mentorados(id),
    analise_json JSONB,
    resumo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES form_templates(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    data JSONB NOT NULL,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scoring_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nps_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id),
    nota INTEGER,
    feedback TEXT,
    tipo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modulo_iv_vendas_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id),
    respostas JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modulo_iii_gestao_marketing_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id),
    respostas JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 8. COMMISSIONS / REFERRALS
-- =====================================================================

CREATE TABLE IF NOT EXISTS comissoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT DEFAULT 'indicacao',
    valor DECIMAL(10,2),
    status TEXT DEFAULT 'pendente',
    data_pagamento DATE,
    metodo_pagamento TEXT,
    comprovante_url TEXT,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    referrer_id UUID,
    mentorado_id UUID REFERENCES mentorados(id),
    referred_lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id),
    referral_code TEXT UNIQUE,
    referral_source TEXT,
    referral_date TIMESTAMPTZ DEFAULT NOW(),
    referral_notes TEXT,
    status TEXT DEFAULT 'pending',
    contract_value DECIMAL(10,2),
    payment_plan TEXT,
    conversion_date TIMESTAMPTZ,
    first_payment_date TIMESTAMPTZ,
    qualification_date TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_referrals_org ON referrals(organization_id);
CREATE INDEX idx_referrals_lead ON referrals(referred_lead_id);

CREATE TABLE IF NOT EXISTS referral_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_percentage DECIMAL(5,2),
    payment_date TIMESTAMPTZ,
    payment_method TEXT,
    payment_reference TEXT,
    status TEXT DEFAULT 'pending',
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    code TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID,
    mentorado_id UUID REFERENCES mentorados(id),
    referral_id UUID REFERENCES referrals(id) ON DELETE CASCADE,
    payment_id UUID,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    commission_type TEXT,
    calculation_method TEXT,
    milestone TEXT,
    base_amount BIGINT NOT NULL DEFAULT 0,
    commission_rate DECIMAL(5,2),
    commission_percentage DECIMAL(5,2),
    commission_amount BIGINT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    eligible_date TIMESTAMPTZ,
    requested_date TIMESTAMPTZ,
    approval_date TIMESTAMPTZ,
    approved_date TIMESTAMPTZ,
    approved_by UUID,
    payment_date TIMESTAMPTZ,
    paid_date TIMESTAMPTZ,
    paid_by UUID,
    payment_method TEXT,
    payment_reference TEXT,
    payment_receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_commissions_org ON commissions(organization_id);
CREATE INDEX idx_commissions_status ON commissions(status);

CREATE TABLE IF NOT EXISTS commission_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
    action TEXT,
    old_status TEXT,
    new_status TEXT,
    old_amount BIGINT,
    new_amount BIGINT,
    performed_by UUID,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    details JSONB,
    notes TEXT,
    ip_address TEXT,
    user_agent TEXT
);

CREATE TABLE IF NOT EXISTS commission_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    default_commission_percentage DECIMAL(5,2) DEFAULT 10,
    first_milestone_percentage DECIMAL(5,2) DEFAULT 50,
    second_milestone_percentage DECIMAL(5,2) DEFAULT 50,
    minimum_payment_percentage DECIMAL(5,2) DEFAULT 0,
    auto_approve_threshold DECIMAL(10,2),
    payment_day_of_month INTEGER DEFAULT 15,
    minimum_withdrawal_amount DECIMAL(10,2) DEFAULT 50,
    notify_on_eligible BOOLEAN DEFAULT true,
    notify_on_payment BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    rule_type TEXT,
    base_value BIGINT,
    conditions JSONB,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    commission_ids UUID[],
    total_amount DECIMAL(10,2) NOT NULL,
    fee_amount DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL,
    payment_data JSONB,
    status TEXT DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    completed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    admin_notes TEXT,
    payment_proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID,
    withdrawal_type TEXT,
    amount BIGINT NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_details JSONB,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_reason TEXT,
    transaction_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
    withdrawal_id UUID REFERENCES withdrawals(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(commission_id, withdrawal_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    profile_id UUID,
    transaction_type TEXT,
    transaction_category TEXT,
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL DEFAULT 0,
    balance_after BIGINT NOT NULL DEFAULT 0,
    reference_type TEXT,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS third_party_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    tipo TEXT,
    pix_key TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commission views
CREATE OR REPLACE VIEW commission_summary AS
SELECT
    c.mentorado_id,
    m.nome_completo,
    m.email,
    c.organization_id,
    COUNT(DISTINCT r.id) AS total_referrals,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'converted') AS converted_referrals,
    COALESCE(SUM(c.commission_amount) FILTER (WHERE c.status = 'pending'), 0) AS pending_amount,
    COALESCE(SUM(c.commission_amount) FILTER (WHERE c.status = 'eligible'), 0) AS eligible_amount,
    COALESCE(SUM(c.commission_amount) FILTER (WHERE c.status = 'approved'), 0) AS approved_amount,
    COALESCE(SUM(c.commission_amount) FILTER (WHERE c.status = 'paid'), 0) AS paid_amount,
    COALESCE(SUM(c.commission_amount), 0) AS total_commission_amount
FROM commissions c
JOIN mentorados m ON m.id = c.mentorado_id
LEFT JOIN referrals r ON r.id = c.referral_id
GROUP BY c.mentorado_id, m.nome_completo, m.email, c.organization_id;

CREATE OR REPLACE VIEW pending_commissions AS
SELECT
    c.id AS commission_id,
    c.mentorado_id,
    m.nome_completo AS mentorado_nome,
    m.email AS mentorado_email,
    c.commission_amount,
    c.milestone,
    c.status,
    c.eligible_date,
    c.lead_id,
    l.nome_completo AS lead_nome,
    c.organization_id
FROM commissions c
JOIN mentorados m ON m.id = c.mentorado_id
LEFT JOIN leads l ON l.id = c.lead_id
WHERE c.status IN ('pending', 'eligible');

CREATE OR REPLACE VIEW referral_details AS
SELECT
    r.id AS referral_id,
    r.mentorado_id,
    m.nome_completo AS mentorado_nome,
    r.referred_lead_id AS lead_id,
    l.nome_completo AS lead_nome,
    l.email AS lead_email,
    l.telefone AS lead_telefone,
    r.referral_date,
    r.status AS referral_status,
    r.contract_value,
    r.conversion_date,
    COALESCE(SUM(rp.payment_amount), 0) AS total_paid,
    COALESCE(AVG(rp.payment_percentage), 0) AS payment_percentage,
    COUNT(rp.id) AS payment_count,
    r.organization_id
FROM referrals r
JOIN mentorados m ON m.id = r.mentorado_id
LEFT JOIN leads l ON l.id = r.referred_lead_id
LEFT JOIN referral_payments rp ON rp.referral_id = r.id
GROUP BY r.id, m.nome_completo, l.nome_completo, l.email, l.telefone;

CREATE OR REPLACE VIEW view_dashboard_comissoes_mentorado AS
SELECT
    m.id AS mentorado_id,
    m.nome_completo,
    m.email,
    m.organization_id,
    COALESCE(COUNT(DISTINCT r.id), 0) AS total_indicacoes,
    COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS total_recebido,
    COALESCE(SUM(CASE WHEN c.status IN ('pending', 'eligible') THEN c.commission_amount ELSE 0 END), 0) AS total_pendente
FROM mentorados m
LEFT JOIN referrals r ON r.mentorado_id = m.id
LEFT JOIN commissions c ON c.mentorado_id = m.id
GROUP BY m.id, m.nome_completo, m.email, m.organization_id;

-- =====================================================================
-- 9. CONTRACTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS contract_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES contract_templates(id),
    lead_id UUID REFERENCES leads(id),
    mentorado_id UUID REFERENCES mentorados(id),
    organization_id UUID REFERENCES organizations(id),
    content TEXT,
    status TEXT DEFAULT 'draft',
    valor DECIMAL(10,2),
    data_assinatura TIMESTAMPTZ,
    assinado_por TEXT,
    ip_assinatura TEXT,
    signature_data JSONB,
    expira_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB,
    performed_by TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_signature_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    company_name TEXT,
    company_cnpj TEXT,
    signatory_name TEXT,
    signatory_cpf TEXT,
    signatory_role TEXT,
    logo_url TEXT,
    footer_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 10. FINANCIAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS categorias_financeiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    tipo TEXT CHECK (tipo IN ('receita', 'despesa', 'investimento')),
    cor TEXT,
    icone TEXT,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacoes_financeiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    categoria_id UUID REFERENCES categorias_financeiras(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    descricao TEXT,
    valor DECIMAL(10,2) NOT NULL,
    data_transacao DATE NOT NULL,
    data_pagamento DATE,
    status TEXT DEFAULT 'confirmado',
    metodo_pagamento TEXT,
    recorrente BOOLEAN DEFAULT false,
    parcela_atual INTEGER,
    total_parcelas INTEGER,
    lead_id UUID REFERENCES leads(id),
    mentorado_id UUID REFERENCES mentorados(id),
    observacoes TEXT,
    comprovante_url TEXT,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_transacoes_org ON transacoes_financeiras(organization_id);
CREATE INDEX idx_transacoes_data ON transacoes_financeiras(data_transacao);

CREATE TABLE IF NOT EXISTS projetos_organizacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    nome TEXT NOT NULL,
    descricao TEXT,
    orcamento DECIMAL(10,2),
    status TEXT DEFAULT 'ativo',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas_mensais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    nome TEXT,
    mes TEXT,
    ano INTEGER,
    salarios_funcionarios DECIMAL(10,2) DEFAULT 0,
    marketing_trafego_pago DECIMAL(10,2) DEFAULT 0,
    ferramentas_tecnologia DECIMAL(10,2) DEFAULT 0,
    consultores_terceirizados DECIMAL(10,2) DEFAULT 0,
    outras_despesas DECIMAL(10,2) DEFAULT 0,
    total_despesas DECIMAL(10,2) DEFAULT 0,
    -- Legacy month columns
    agosto DECIMAL(10,2) DEFAULT 0,
    setembro DECIMAL(10,2) DEFAULT 0,
    outubro DECIMAL(10,2) DEFAULT 0,
    novembro DECIMAL(10,2) DEFAULT 0,
    dezembro DECIMAL(10,2) DEFAULT 0,
    janeiro DECIMAL(10,2) DEFAULT 0,
    fevereiro DECIMAL(10,2) DEFAULT 0,
    marco DECIMAL(10,2) DEFAULT 0,
    abril DECIMAL(10,2) DEFAULT 0,
    maio DECIMAL(10,2) DEFAULT 0,
    junho DECIMAL(10,2) DEFAULT 0,
    julho DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    nome TEXT NOT NULL,
    descricao TEXT,
    responsavel TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_unit_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_unit_id UUID REFERENCES business_units(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    mes INTEGER,
    ano INTEGER,
    receita DECIMAL(10,2) DEFAULT 0,
    despesa DECIMAL(10,2) DEFAULT 0,
    lucro DECIMAL(10,2) DEFAULT 0,
    meta DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 11. EVENTS / GROUP CALLS
-- =====================================================================

CREATE TABLE IF NOT EXISTS group_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'call',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    meet_link TEXT,
    max_participants INTEGER,
    status TEXT DEFAULT 'scheduled',
    host_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id),
    mentorado_id UUID REFERENCES mentorados(id),
    nome TEXT,
    email TEXT,
    telefone TEXT,
    status TEXT DEFAULT 'registered',
    attended BOOLEAN DEFAULT false,
    converted BOOLEAN DEFAULT false,
    notes TEXT,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 12. WHATSAPP
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    contact_phone TEXT,
    contact_name TEXT,
    message_text TEXT,
    message_type TEXT DEFAULT 'text',
    direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
    status TEXT DEFAULT 'sent',
    media_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_whatsapp_msg_org ON whatsapp_messages(organization_id);
CREATE INDEX idx_whatsapp_msg_phone ON whatsapp_messages(contact_phone);

-- =====================================================================
-- 13. INSTAGRAM
-- =====================================================================

CREATE TABLE IF NOT EXISTS instagram_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    trigger_type TEXT,
    trigger_keywords TEXT[],
    response_message TEXT,
    is_active BOOLEAN DEFAULT true,
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_funnel_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES instagram_funnels(id) ON DELETE CASCADE,
    step_order INTEGER DEFAULT 0,
    message TEXT,
    delay_seconds INTEGER DEFAULT 0,
    action_type TEXT,
    config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES instagram_automations(id),
    organization_id UUID REFERENCES organizations(id),
    user_id TEXT,
    username TEXT,
    action TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id TEXT,
    username TEXT,
    message_text TEXT,
    direction TEXT,
    automation_id UUID REFERENCES instagram_automations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 14. AI / CHAT
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    model TEXT,
    tokens_used INTEGER DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    request_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    mentorado_id UUID REFERENCES mentorados(id),
    organization_id UUID REFERENCES organizations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    session_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_chat_user ON ai_chat_history(user_id);
CREATE INDEX idx_ai_chat_session ON ai_chat_history(session_id);

CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persona_form_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    respostas JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persona_pains_desires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    tipo TEXT CHECK (tipo IN ('dor', 'desejo')),
    conteudo TEXT NOT NULL,
    categoria TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 15. GOALS / METRICS
-- =====================================================================

CREATE TABLE IF NOT EXISTS metas_anuais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    ano INTEGER NOT NULL,
    tipo TEXT,
    valor_meta DECIMAL(10,2),
    valor_atual DECIMAL(10,2) DEFAULT 0,
    descricao TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, ano, tipo)
);

CREATE TABLE IF NOT EXISTS metas_mensais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    tipo TEXT,
    valor_meta DECIMAL(10,2),
    valor_atual DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Views for performance
CREATE OR REPLACE VIEW vw_performance_vs_meta AS
SELECT
    mm.organization_id,
    mm.ano,
    mm.mes,
    mm.tipo,
    mm.valor_meta,
    mm.valor_atual,
    CASE WHEN mm.valor_meta > 0
         THEN ROUND((mm.valor_atual / mm.valor_meta) * 100, 1)
         ELSE 0 END AS percentual_atingimento
FROM metas_mensais mm;

CREATE OR REPLACE VIEW vw_performance_anual AS
SELECT
    ma.organization_id,
    ma.ano,
    ma.tipo,
    ma.valor_meta,
    ma.valor_atual,
    CASE WHEN ma.valor_meta > 0
         THEN ROUND((ma.valor_atual / ma.valor_meta) * 100, 1)
         ELSE 0 END AS percentual_atingimento
FROM metas_anuais ma;

-- =====================================================================
-- 16. MIND MAPS
-- =====================================================================

CREATE TABLE IF NOT EXISTS mind_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    title TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_template BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 17. NOTIFICATIONS
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    action_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT,
    recipient TEXT,
    channel TEXT,
    status TEXT DEFAULT 'sent',
    details JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 18. POSTS / SOCIAL MEDIA
-- =====================================================================

CREATE TABLE IF NOT EXISTS saved_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    organization_id UUID REFERENCES organizations(id),
    title TEXT,
    config JSONB NOT NULL,
    template TEXT,
    preview_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 19. LEAD QUALIFICATION SYSTEM (V2)
-- =====================================================================

CREATE TABLE IF NOT EXISTS lead_qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    origem_conhecimento VARCHAR(100) NOT NULL,
    tempo_seguindo VARCHAR(50),
    nome_indicacao VARCHAR(255),
    situacao_negocio TEXT NOT NULL,
    faturamento_atual DECIMAL(10,2),
    objetivo_faturamento DECIMAL(10,2),
    forma_pagamento TEXT NOT NULL,
    urgencia TEXT NOT NULL,
    motivacao_principal TEXT,
    investiu_mentoria_antes BOOLEAN DEFAULT false,
    maior_desafio TEXT,
    score_total INTEGER NOT NULL DEFAULT 0,
    temperatura TEXT NOT NULL DEFAULT 'morno',
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    psychological_profile JSONB,
    engagement_signals JSONB,
    form_version VARCHAR(10) DEFAULT '1.0',
    completion_time INTEGER,
    abandonment_points TEXT[],
    device_info JSONB,
    ip_address TEXT,
    status VARCHAR(50) DEFAULT 'new',
    assigned_to UUID,
    follow_up_date DATE,
    notes TEXT,
    crm_id VARCHAR(100),
    email_sent BOOLEAN DEFAULT false,
    whatsapp_sent BOOLEAN DEFAULT false,
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_quals_score ON lead_qualifications(score_total DESC);
CREATE INDEX idx_lead_quals_temp ON lead_qualifications(temperatura);

CREATE TABLE IF NOT EXISTS lead_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    lead_qualification_id UUID REFERENCES lead_qualifications(id) ON DELETE CASCADE,
    closer_id UUID,
    organization_id UUID REFERENCES organizations(id),
    interaction_type VARCHAR(50),
    tipo_interacao TEXT,
    data_interacao TIMESTAMPTZ DEFAULT NOW(),
    duracao_minutos INTEGER,
    canal TEXT,
    resumo TEXT,
    detalhes_completos TEXT,
    objecoes_encontradas TEXT[],
    pontos_dor_identificados TEXT[],
    interesse_manifestado INTEGER,
    resultado TEXT,
    proxima_acao TEXT,
    data_proxima_acao TIMESTAMPTZ,
    responsavel_proxima_acao TEXT,
    valor_proposta DECIMAL(10,2),
    desconto_oferecido DECIMAL(5,2),
    condicoes_pagamento TEXT,
    qualificacao_budget TEXT,
    qualificacao_autoridade TEXT,
    qualificacao_necessidade TEXT,
    qualificacao_timeline TEXT,
    sentimento_lead TEXT,
    nivel_interesse INTEGER,
    probabilidade_fechamento_percebida DECIMAL(5,2),
    gravacao_url TEXT,
    anexos_urls TEXT[],
    notes TEXT,
    outcome VARCHAR(100),
    next_action VARCHAR(100),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_form_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variation_name VARCHAR(100) NOT NULL,
    variation_code VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    traffic_percentage INTEGER DEFAULT 50,
    questions_order JSONB,
    copy_variations JSONB,
    design_tokens JSONB,
    total_views INTEGER DEFAULT 0,
    total_submissions INTEGER DEFAULT 0,
    total_hot_leads INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_form_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) NOT NULL,
    lead_id UUID REFERENCES lead_qualifications(id),
    variation_id UUID REFERENCES lead_form_variations(id),
    field_interactions JSONB,
    field_changes JSONB,
    scroll_depth INTEGER,
    mouse_movements INTEGER,
    abandoned BOOLEAN DEFAULT false,
    abandonment_field VARCHAR(100),
    abandonment_time INTEGER,
    user_agent TEXT,
    referrer TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) NOT NULL,
    rule_category VARCHAR(50) NOT NULL,
    condition_field VARCHAR(100) NOT NULL,
    condition_operator VARCHAR(20) NOT NULL,
    condition_value TEXT NOT NULL,
    points INTEGER NOT NULL,
    weight_percentage INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    instant_hot_qualifier BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) NOT NULL,
    temperature TEXT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 20. APPLY updated_at TRIGGERS TO ALL TABLES
-- =====================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        INNER JOIN information_schema.tables tbl
            ON c.table_name = tbl.table_name
            AND c.table_schema = tbl.table_schema
        WHERE c.column_name = 'updated_at'
        AND c.table_schema = 'public'
        AND tbl.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- =====================================================================
-- 21. KEY RPC FUNCTIONS
-- =====================================================================

-- Calculate closer metrics
CREATE OR REPLACE FUNCTION calculate_closer_metrics(
    p_closer_id UUID,
    p_month INTEGER DEFAULT NULL,
    p_year INTEGER DEFAULT NULL
)
RETURNS TABLE(
    total_vendas BIGINT,
    valor_total DECIMAL,
    comissao_total DECIMAL,
    taxa_conversao DECIMAL,
    leads_atendidos BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT cv.id)::BIGINT,
        COALESCE(SUM(cv.valor_venda), 0)::DECIMAL,
        COALESCE(SUM(cv.valor_comissao), 0)::DECIMAL,
        CASE
            WHEN COUNT(DISTINCT ca.lead_id) > 0
            THEN (COUNT(DISTINCT cv.id)::DECIMAL / COUNT(DISTINCT ca.lead_id)::DECIMAL * 100)
            ELSE 0
        END,
        COUNT(DISTINCT ca.lead_id)::BIGINT
    FROM closers c
    LEFT JOIN closers_vendas cv ON c.id = cv.closer_id
        AND cv.status_venda = 'confirmada'
        AND (p_month IS NULL OR EXTRACT(MONTH FROM cv.data_venda) = p_month)
        AND (p_year IS NULL OR EXTRACT(YEAR FROM cv.data_venda) = p_year)
    LEFT JOIN closers_atividades ca ON c.id = ca.closer_id
        AND (p_month IS NULL OR EXTRACT(MONTH FROM ca.data_atividade) = p_month)
        AND (p_year IS NULL OR EXTRACT(YEAR FROM ca.data_atividade) = p_year)
    WHERE c.id = p_closer_id;
END;
$$ LANGUAGE plpgsql;

-- Calculate commission
CREATE OR REPLACE FUNCTION calculate_commission(
    p_sale_amount BIGINT,
    p_organization_id UUID,
    p_commission_type TEXT
) RETURNS BIGINT AS $$
DECLARE
    v_fixed_rate BIGINT;
BEGIN
    SELECT comissao_fixa_indicacao INTO v_fixed_rate
    FROM organizations WHERE id = p_organization_id;
    IF v_fixed_rate IS NULL THEN v_fixed_rate := 2000; END IF;
    RETURN v_fixed_rate;
END;
$$ LANGUAGE plpgsql;

-- Process referral conversion
CREATE OR REPLACE FUNCTION process_referral_conversion(
    p_lead_id UUID,
    p_sale_amount BIGINT
) RETURNS UUID AS $$
DECLARE
    v_referral RECORD;
    v_commission_id UUID;
    v_commission_amount BIGINT;
BEGIN
    SELECT * INTO v_referral FROM referrals
    WHERE referred_lead_id = p_lead_id AND status = 'qualified';
    IF v_referral IS NULL THEN RETURN NULL; END IF;

    UPDATE referrals SET status = 'converted', conversion_date = NOW() WHERE id = v_referral.id;

    v_commission_amount := calculate_commission(p_sale_amount, v_referral.organization_id, 'referral');

    INSERT INTO commissions (organization_id, mentorado_id, referral_id, lead_id, commission_type, calculation_method, base_amount, commission_amount, status)
    VALUES (v_referral.organization_id, v_referral.mentorado_id, v_referral.id, p_lead_id, 'referral', 'fixed', p_sale_amount, v_commission_amount, 'pending')
    RETURNING id INTO v_commission_id;

    UPDATE leads SET comissao_id = v_commission_id, possui_comissao = true WHERE id = p_lead_id;
    RETURN v_commission_id;
END;
$$ LANGUAGE plpgsql;

-- Initialize default kanban
CREATE OR REPLACE FUNCTION initialize_default_kanban(p_org_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_board_id UUID;
BEGIN
    INSERT INTO kanban_boards (organization_id, user_id, name)
    VALUES (p_org_id, p_user_id, 'Pipeline de Vendas')
    RETURNING id INTO v_board_id;

    INSERT INTO kanban_columns (board_id, name, color, column_order) VALUES
        (v_board_id, 'Novo', '#3B82F6', 0),
        (v_board_id, 'Contactado', '#8B5CF6', 1),
        (v_board_id, 'Qualificado', '#F59E0B', 2),
        (v_board_id, 'Proposta', '#10B981', 3),
        (v_board_id, 'Fechado', '#22C55E', 4),
        (v_board_id, 'Perdido', '#EF4444', 5);

    RETURN v_board_id;
END;
$$ LANGUAGE plpgsql;

-- Get kanban board data
CREATE OR REPLACE FUNCTION get_kanban_board_data(p_board_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'board', row_to_json(b),
        'columns', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'column', row_to_json(col),
                    'tasks', COALESCE((
                        SELECT jsonb_agg(row_to_json(t) ORDER BY t.task_order)
                        FROM kanban_tasks t WHERE t.column_id = col.id
                    ), '[]'::jsonb)
                ) ORDER BY col.column_order
            )
            FROM kanban_columns col WHERE col.board_id = b.id
        )
    ) INTO v_result
    FROM kanban_boards b WHERE b.id = p_board_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Move kanban task
CREATE OR REPLACE FUNCTION move_kanban_task(
    p_task_id UUID,
    p_target_column_id UUID,
    p_new_order INTEGER
) RETURNS VOID AS $$
BEGIN
    UPDATE kanban_tasks SET column_id = p_target_column_id, task_order = p_new_order WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Update continue watching
CREATE OR REPLACE FUNCTION update_continue_watching(
    p_mentorado_id UUID,
    p_lesson_id UUID,
    p_position INTEGER,
    p_org_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO continue_watching (mentorado_id, lesson_id, last_position_seconds, last_watched_at, organization_id)
    VALUES (p_mentorado_id, p_lesson_id, p_position, NOW(), p_org_id)
    ON CONFLICT (mentorado_id, lesson_id)
    DO UPDATE SET last_position_seconds = p_position, last_watched_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Process mentorado churn
CREATE OR REPLACE FUNCTION process_mentorado_churn(p_mentorado_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    UPDATE mentorados
    SET estado_atual = 'churn',
        status_login = 'inativo',
        motivo_exclusao = p_motivo,
        data_exclusao = NOW(),
        excluido = true
    WHERE id = p_mentorado_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 22. STORAGE BUCKETS (create manually or via Supabase)
-- =====================================================================

-- These need to be created via Supabase dashboard or API:
-- 1. followup-media  (follow-up attachments)
-- 2. avatars         (user/mentorado avatars)
-- 3. lesson-materials (PDFs for lessons)

-- =====================================================================
-- SCHEMA COMPLETE
-- Total: ~115 tables, 10 views, 10+ functions
-- =====================================================================
