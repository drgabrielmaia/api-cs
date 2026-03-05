-- =====================================================================
-- Migration 23: Airbnb para Medicos + Eventos com Ingressos
-- Creates clinic rental marketplace tables and event ticket system
-- =====================================================================

BEGIN;

-- =====================================================================
-- AIRBNB PARA MEDICOS
-- =====================================================================

-- Clinicas (listings)
CREATE TABLE IF NOT EXISTS clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    owner_mentorado_id UUID REFERENCES mentorados(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    bairro TEXT,

    -- Precos
    preco_por_turno DECIMAL(10,2) DEFAULT 0,
    preco_por_dia DECIMAL(10,2) DEFAULT 0,
    preco_por_mes DECIMAL(10,2) DEFAULT 0,

    -- Amenidades
    tem_videomaker BOOLEAN DEFAULT false,
    tem_recepcionista BOOLEAN DEFAULT false,
    tem_estacionamento BOOLEAN DEFAULT false,
    tem_wifi BOOLEAN DEFAULT false,
    tem_ar_condicionado BOOLEAN DEFAULT false,
    tem_sala_espera BOOLEAN DEFAULT false,
    tem_raio_x BOOLEAN DEFAULT false,
    tem_autoclave BOOLEAN DEFAULT false,
    tem_banheiro_privativo BOOLEAN DEFAULT false,
    tem_acessibilidade BOOLEAN DEFAULT false,

    -- Detalhes
    numero_salas INTEGER DEFAULT 1,
    area_m2 DECIMAL(8,2),
    especialidades_recomendadas TEXT,
    horario_funcionamento TEXT,
    regras TEXT,

    -- Fotos
    foto_capa TEXT,
    fotos TEXT[] DEFAULT '{}',

    -- Status
    status TEXT DEFAULT 'em_revisao' CHECK (status IN ('ativa','inativa','em_revisao')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinicas_org ON clinicas(organization_id);
CREATE INDEX idx_clinicas_owner ON clinicas(owner_mentorado_id);
CREATE INDEX idx_clinicas_cidade ON clinicas(cidade);
CREATE INDEX idx_clinicas_status ON clinicas(status);

CREATE TRIGGER update_clinicas_updated_at
    BEFORE UPDATE ON clinicas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reservas de clinicas
CREATE TABLE IF NOT EXISTS clinica_reservas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    turno TEXT DEFAULT 'integral' CHECK (turno IN ('manha','tarde','integral')),

    valor_total DECIMAL(10,2) NOT NULL,
    valor_taxa_plataforma DECIMAL(10,2) DEFAULT 0,
    percentual_taxa DECIMAL(5,2) DEFAULT 0,

    status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','cancelada','concluida')),
    observacoes TEXT,
    motivo_cancelamento TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservas_clinica ON clinica_reservas(clinica_id);
CREATE INDEX idx_reservas_mentorado ON clinica_reservas(mentorado_id);
CREATE INDEX idx_reservas_datas ON clinica_reservas(data_inicio, data_fim);
CREATE INDEX idx_reservas_status ON clinica_reservas(status);

CREATE TRIGGER update_clinica_reservas_updated_at
    BEFORE UPDATE ON clinica_reservas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Avaliacoes de clinicas
CREATE TABLE IF NOT EXISTS clinica_avaliacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    reserva_id UUID REFERENCES clinica_reservas(id) ON DELETE SET NULL,

    nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
    comentario TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_avaliacoes_clinica ON clinica_avaliacoes(clinica_id);

-- Config do admin (percentual de lucro, etc)
CREATE TABLE IF NOT EXISTS airbnb_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    percentual_lucro DECIMAL(5,2) DEFAULT 10.00,
    termos_uso TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_airbnb_config_updated_at
    BEFORE UPDATE ON airbnb_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default config
INSERT INTO airbnb_config (organization_id, percentual_lucro)
VALUES ('9c8c0033-15ea-4e33-a55f-28d81a19693b', 10.00)
ON CONFLICT (organization_id) DO NOTHING;

-- =====================================================================
-- EVENTOS COM INGRESSOS
-- =====================================================================

-- Adicionar campos de preco/visibilidade ao group_events
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS valor_ingresso DECIMAL(10,2) DEFAULT 0;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS local_evento TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS imagem_capa TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS visivel_mentorados BOOLEAN DEFAULT false;

-- Tabela de ingressos
CREATE TABLE IF NOT EXISTS evento_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
    mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    codigo_ticket TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','usado','cancelado')),

    valor_pago DECIMAL(10,2) DEFAULT 0,
    metodo_pagamento TEXT,

    usado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_event ON evento_tickets(event_id);
CREATE INDEX idx_tickets_mentorado ON evento_tickets(mentorado_id);
CREATE INDEX idx_tickets_codigo ON evento_tickets(codigo_ticket);

CREATE TRIGGER update_evento_tickets_updated_at
    BEFORE UPDATE ON evento_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

DO $$ BEGIN RAISE NOTICE 'Migration 23 complete — Airbnb + Eventos tables created'; END $$;
