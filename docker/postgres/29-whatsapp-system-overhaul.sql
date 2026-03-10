-- =====================================================================
-- Migration 29: WhatsApp System Overhaul
-- Multi-instance, Identity Resolution PN/LID, Automation Engine,
-- Lead/Mentorado/Financial Integration
-- =====================================================================

-- =====================================================================
-- 1. WHATSAPP INSTANCES (multi-número)
-- =====================================================================
CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT,
    department TEXT,
    description TEXT,
    status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'qr_pending', 'connecting')),
    session_path TEXT,
    auto_reconnect BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    responsible_user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_connected_at TIMESTAMPTZ,
    UNIQUE(organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_wa_instances_org ON whatsapp_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_instances_status ON whatsapp_instances(organization_id, status);

-- =====================================================================
-- 2. WA_CONTACTS (identidade unificada)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    display_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    identity_status TEXT DEFAULT 'resolved' CHECK (identity_status IN ('resolved', 'pending_resolution', 'merged')),
    merged_into UUID REFERENCES wa_contacts(id),
    is_active BOOLEAN DEFAULT true,
    -- Vínculos com entidades existentes
    lead_id UUID,
    mentorado_id UUID,
    closer_id UUID,
    -- Campos extras
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    pipeline_stage TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_org ON wa_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_phone ON wa_contacts(organization_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_lead ON wa_contacts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_contacts_mentorado ON wa_contacts(mentorado_id) WHERE mentorado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_contacts_identity ON wa_contacts(organization_id, identity_status) WHERE identity_status = 'pending_resolution';
CREATE INDEX IF NOT EXISTS idx_wa_contacts_merged ON wa_contacts(merged_into) WHERE merged_into IS NOT NULL;

-- =====================================================================
-- 3. CONTACT_IDENTIFIERS (PN, LID, aliases)
-- =====================================================================
CREATE TABLE IF NOT EXISTS contact_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
    jid TEXT NOT NULL UNIQUE,
    jid_type TEXT NOT NULL CHECK (jid_type IN ('pn', 'lid', 'group')),
    is_primary BOOLEAN DEFAULT false,
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    discovered_via TEXT,
    instance_id UUID REFERENCES whatsapp_instances(id)
);
CREATE INDEX IF NOT EXISTS idx_contact_identifiers_contact ON contact_identifiers(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_identifiers_jid ON contact_identifiers(jid);

-- =====================================================================
-- 4. LID_MAPPINGS (cache de mapeamento PN↔LID)
-- Atualizar tabela existente ou criar nova
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_lid_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pn_jid TEXT NOT NULL,
    lid_jid TEXT NOT NULL UNIQUE,
    confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
    source TEXT NOT NULL,
    instance_id UUID REFERENCES whatsapp_instances(id),
    discovered_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_lid_pn ON wa_lid_mappings(pn_jid);
CREATE INDEX IF NOT EXISTS idx_wa_lid_lid ON wa_lid_mappings(lid_jid);

-- =====================================================================
-- 5. WA_CHATS (um chat por contato × instância)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES wa_contacts(id),
    instance_id UUID NOT NULL REFERENCES whatsapp_instances(id),
    is_group BOOLEAN DEFAULT false,
    group_jid TEXT,
    group_name TEXT,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    unread_count INT DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived', 'waiting')),
    assigned_to UUID,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    is_automation_paused BOOLEAN DEFAULT false,
    pipeline_stage TEXT,
    -- Dados financeiros vinculados
    financial_status TEXT CHECK (financial_status IN ('em_dia', 'pendente', 'atrasado', 'inadimplente', NULL)),
    valor_pendente NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contact_id, instance_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_chats_org ON wa_chats(organization_id, instance_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_contact ON wa_chats(contact_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_status ON wa_chats(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last_msg ON wa_chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_chats_assigned ON wa_chats(assigned_to) WHERE status = 'open';

-- =====================================================================
-- 6. WA_MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES wa_chats(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES wa_contacts(id),
    instance_id UUID REFERENCES whatsapp_instances(id),
    wa_message_id TEXT,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'button_response')),
    body TEXT,
    media_url TEXT,
    media_mime TEXT,
    media_size INT,
    metadata JSONB DEFAULT '{}',
    sent_by_automation_id UUID,
    status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    wa_timestamp TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat ON wa_messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_wa_id ON wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_contact ON wa_messages(contact_id, created_at DESC);

-- =====================================================================
-- 7. IDENTITY MERGE LOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS identity_merge_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    from_contact_id UUID,
    to_contact_id UUID,
    reason TEXT,
    merged_by TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merge_log_org ON identity_merge_log(organization_id, created_at DESC);

-- =====================================================================
-- 8. AUTOMATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INT DEFAULT 100,
    scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'instance_specific')),
    instance_ids UUID[] DEFAULT '{}',
    conflict_mode TEXT DEFAULT 'continue' CHECK (conflict_mode IN ('stop_others', 'continue', 'fallback')),
    version INT DEFAULT 1,
    max_executions_per_contact INT DEFAULT 5,
    cooldown_seconds INT DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_automations_org ON wa_automations(organization_id, is_active);

-- =====================================================================
-- 9. AUTOMATION TRIGGERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automation_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES wa_automations(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'message_received', 'message_sent', 'contact_created', 'contact_tag_added',
        'contact_stage_changed', 'schedule_cron', 'webhook_received',
        'keyword_detected', 'no_response_timeout', 'chat_opened', 'chat_closed',
        'payment_overdue', 'lead_converted', 'mentorado_created'
    )),
    config JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_wa_triggers_automation ON wa_automation_triggers(automation_id);

-- =====================================================================
-- 10. AUTOMATION CONDITIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automation_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES wa_automations(id) ON DELETE CASCADE,
    order_index INT DEFAULT 0,
    condition_type TEXT NOT NULL CHECK (condition_type IN (
        'contact_has_tag', 'contact_in_stage', 'instance_is', 'time_window',
        'message_contains', 'contact_field_equals', 'custom_expression',
        'is_lead', 'is_mentorado', 'financial_status', 'lead_status',
        'has_pending_payment', 'contact_replied_within'
    )),
    operator TEXT DEFAULT 'eq' CHECK (operator IN ('eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'regex', 'in', 'not_in', 'exists', 'not_exists')),
    config JSONB DEFAULT '{}',
    logic_gate TEXT DEFAULT 'AND' CHECK (logic_gate IN ('AND', 'OR'))
);
CREATE INDEX IF NOT EXISTS idx_wa_conditions_automation ON wa_automation_conditions(automation_id);

-- =====================================================================
-- 11. AUTOMATION ACTIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES wa_automations(id) ON DELETE CASCADE,
    order_index INT DEFAULT 0,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'send_message', 'send_template', 'send_media',
        'wait_delay', 'wait_for_reply',
        'add_tag', 'remove_tag', 'change_stage',
        'assign_to_user', 'create_calendar_event', 'create_lead',
        'call_webhook', 'set_contact_field',
        'pause_automation', 'transfer_to_human',
        'run_sub_automation', 'send_notification',
        'update_lead_status', 'update_financial_status',
        'link_to_mentorado', 'send_payment_reminder'
    )),
    config JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_wa_actions_automation ON wa_automation_actions(automation_id);

-- =====================================================================
-- 12. AUTOMATION EXECUTIONS (estado de execução)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES wa_automations(id),
    automation_version INT DEFAULT 1,
    contact_id UUID REFERENCES wa_contacts(id),
    instance_id UUID REFERENCES whatsapp_instances(id),
    chat_id UUID REFERENCES wa_chats(id),
    status TEXT DEFAULT 'running' CHECK (status IN (
        'running', 'waiting_delay', 'waiting_reply', 'completed',
        'failed', 'cancelled', 'paused_by_human'
    )),
    current_action_index INT DEFAULT 0,
    context JSONB DEFAULT '{}',
    trigger_event JSONB DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    resume_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_executions_automation ON wa_automation_executions(automation_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_executions_contact ON wa_automation_executions(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_executions_resume ON wa_automation_executions(status, resume_at) WHERE status = 'waiting_delay';

-- =====================================================================
-- 13. AUTOMATION VERSIONS (histórico)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_automation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES wa_automations(id) ON DELETE CASCADE,
    version INT NOT NULL,
    trigger_snapshot JSONB,
    conditions_snapshot JSONB,
    actions_snapshot JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    change_description TEXT,
    UNIQUE(automation_id, version)
);

-- =====================================================================
-- 14. MESSAGE TEMPLATES
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    body TEXT NOT NULL,
    media_url TEXT,
    variables TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- =====================================================================
-- 15. SCHEDULED JOBS (para delays de automação)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    job_type TEXT NOT NULL CHECK (job_type IN ('automation_resume', 'send_scheduled', 'cron_trigger', 'payment_reminder', 'followup')),
    payload JSONB NOT NULL DEFAULT '{}',
    execute_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_jobs_pending ON wa_scheduled_jobs(status, execute_at) WHERE status = 'pending';

-- =====================================================================
-- 16. WA_CONTACT_NOTES (anotações do contato no contexto WhatsApp)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_contact_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    content TEXT NOT NULL,
    note_type TEXT DEFAULT 'geral' CHECK (note_type IN ('geral', 'financeiro', 'atendimento', 'follow_up', 'reclamacao', 'elogio')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_notes_contact ON wa_contact_notes(contact_id, created_at DESC);

-- =====================================================================
-- 17. WA_CONTACT_HISTORY (histórico de ações no contato)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_contact_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    action TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    actor_type TEXT DEFAULT 'system' CHECK (actor_type IN ('user', 'system', 'automation')),
    actor_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_history_contact ON wa_contact_history(contact_id, created_at DESC);

-- =====================================================================
-- 18. WA_AUDIT_LOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action TEXT NOT NULL,
    actor_type TEXT,
    actor_id TEXT,
    changes JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_audit_org ON wa_audit_log(organization_id, entity_type, created_at DESC);

-- =====================================================================
-- 19. PIPELINE STAGES (funil configurável)
-- =====================================================================
CREATE TABLE IF NOT EXISTS wa_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline_name TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    color TEXT DEFAULT '#6B7280',
    is_final BOOLEAN DEFAULT false,
    UNIQUE(organization_id, pipeline_name, name)
);

-- Inserir estágios padrão
INSERT INTO wa_pipeline_stages (organization_id, pipeline_name, name, order_index, color)
SELECT o.id, 'atendimento', stage.name, stage.idx, stage.color
FROM organizations o
CROSS JOIN (VALUES
    ('Novo', 0, '#3B82F6'),
    ('Em Atendimento', 1, '#F59E0B'),
    ('Aguardando Resposta', 2, '#8B5CF6'),
    ('Qualificado', 3, '#10B981'),
    ('Em Negociação', 4, '#F97316'),
    ('Vendido', 5, '#22C55E'),
    ('Perdido', 6, '#EF4444'),
    ('Finalizado', 7, '#6B7280')
) AS stage(name, idx, color)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 20. FUNCTION: Resolve JID to contact_id (usado pelo backend)
-- =====================================================================
CREATE OR REPLACE FUNCTION resolve_wa_contact(
    p_org_id UUID,
    p_jid TEXT,
    p_display_name TEXT DEFAULT NULL,
    p_instance_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_contact_id UUID;
    v_jid_type TEXT;
    v_phone TEXT;
    v_pn_jid TEXT;
BEGIN
    -- Determinar tipo do JID
    IF p_jid LIKE '%@lid' THEN
        v_jid_type := 'lid';
    ELSIF p_jid LIKE '%@g.us' THEN
        v_jid_type := 'group';
    ELSE
        v_jid_type := 'pn';
    END IF;

    -- 1. Buscar por JID nos identificadores existentes
    SELECT ci.contact_id INTO v_contact_id
    FROM contact_identifiers ci
    JOIN wa_contacts wc ON wc.id = ci.contact_id
    WHERE ci.jid = p_jid AND wc.organization_id = p_org_id AND wc.is_active = true
    LIMIT 1;

    IF v_contact_id IS NOT NULL THEN
        -- Verificar se foi merged
        SELECT COALESCE(merged_into, id) INTO v_contact_id
        FROM wa_contacts WHERE id = v_contact_id;
        RETURN v_contact_id;
    END IF;

    -- 2. Se é LID, tentar encontrar mapeamento PN↔LID
    IF v_jid_type = 'lid' THEN
        SELECT pn_jid INTO v_pn_jid
        FROM wa_lid_mappings WHERE lid_jid = p_jid LIMIT 1;

        IF v_pn_jid IS NOT NULL THEN
            -- Buscar contato pelo PN
            SELECT ci.contact_id INTO v_contact_id
            FROM contact_identifiers ci
            JOIN wa_contacts wc ON wc.id = ci.contact_id
            WHERE ci.jid = v_pn_jid AND wc.organization_id = p_org_id AND wc.is_active = true
            LIMIT 1;

            IF v_contact_id IS NOT NULL THEN
                -- Adicionar o LID como identificador adicional
                INSERT INTO contact_identifiers (contact_id, jid, jid_type, discovered_via, instance_id)
                VALUES (v_contact_id, p_jid, 'lid', 'lid_mapping_resolution', p_instance_id)
                ON CONFLICT (jid) DO NOTHING;
                RETURN v_contact_id;
            END IF;
        END IF;
    END IF;

    -- 3. Se é PN, tentar match por phone_number nos contatos existentes
    IF v_jid_type = 'pn' THEN
        v_phone := REPLACE(p_jid, '@s.whatsapp.net', '');

        SELECT id INTO v_contact_id
        FROM wa_contacts
        WHERE organization_id = p_org_id
          AND phone_number = v_phone
          AND is_active = true
        LIMIT 1;

        IF v_contact_id IS NOT NULL THEN
            -- Adicionar identificador
            INSERT INTO contact_identifiers (contact_id, jid, jid_type, is_primary, discovered_via, instance_id)
            VALUES (v_contact_id, p_jid, 'pn', true, 'phone_match', p_instance_id)
            ON CONFLICT (jid) DO NOTHING;
            RETURN v_contact_id;
        END IF;
    END IF;

    -- 4. Criar novo contato
    IF v_jid_type = 'pn' THEN
        v_phone := REPLACE(p_jid, '@s.whatsapp.net', '');
    END IF;

    INSERT INTO wa_contacts (organization_id, display_name, phone_number, identity_status)
    VALUES (
        p_org_id,
        COALESCE(p_display_name, v_phone, p_jid),
        v_phone,
        CASE WHEN v_jid_type = 'lid' THEN 'pending_resolution' ELSE 'resolved' END
    )
    RETURNING id INTO v_contact_id;

    -- Adicionar identificador
    INSERT INTO contact_identifiers (contact_id, jid, jid_type, is_primary, discovered_via, instance_id)
    VALUES (v_contact_id, p_jid, v_jid_type, true, 'auto_created', p_instance_id)
    ON CONFLICT (jid) DO NOTHING;

    -- Auto-vincular com lead existente pelo telefone
    IF v_phone IS NOT NULL THEN
        UPDATE wa_contacts SET lead_id = (
            SELECT id FROM leads
            WHERE organization_id = p_org_id
              AND telefone LIKE '%' || RIGHT(v_phone, 9)
            LIMIT 1
        ) WHERE id = v_contact_id AND lead_id IS NULL;

        -- Auto-vincular com mentorado existente pelo telefone
        UPDATE wa_contacts SET mentorado_id = (
            SELECT id FROM mentorados
            WHERE organization_id = p_org_id
              AND telefone LIKE '%' || RIGHT(v_phone, 9)
            LIMIT 1
        ) WHERE id = v_contact_id AND mentorado_id IS NULL;
    END IF;

    RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 21. FUNCTION: Merge two contacts
-- =====================================================================
CREATE OR REPLACE FUNCTION merge_wa_contacts(
    p_org_id UUID,
    p_keep_contact_id UUID,
    p_merge_contact_id UUID,
    p_reason TEXT DEFAULT 'manual_merge',
    p_merged_by TEXT DEFAULT 'system'
) RETURNS VOID AS $$
BEGIN
    -- Mover identificadores
    UPDATE contact_identifiers SET contact_id = p_keep_contact_id WHERE contact_id = p_merge_contact_id;

    -- Mover mensagens
    UPDATE wa_messages SET contact_id = p_keep_contact_id WHERE contact_id = p_merge_contact_id;

    -- Mover chats (update contact_id, se conflito de UNIQUE, mover msgs e deletar chat duplicado)
    UPDATE wa_chats SET contact_id = p_keep_contact_id WHERE contact_id = p_merge_contact_id
    AND NOT EXISTS (
        SELECT 1 FROM wa_chats WHERE contact_id = p_keep_contact_id AND instance_id = wa_chats.instance_id
    );

    -- Mover notas
    UPDATE wa_contact_notes SET contact_id = p_keep_contact_id WHERE contact_id = p_merge_contact_id;

    -- Mover histórico
    UPDATE wa_contact_history SET contact_id = p_keep_contact_id WHERE contact_id = p_merge_contact_id;

    -- Copiar lead_id e mentorado_id se o destino não tiver
    UPDATE wa_contacts k SET
        lead_id = COALESCE(k.lead_id, m.lead_id),
        mentorado_id = COALESCE(k.mentorado_id, m.mentorado_id),
        closer_id = COALESCE(k.closer_id, m.closer_id),
        phone_number = COALESCE(k.phone_number, m.phone_number)
    FROM wa_contacts m
    WHERE k.id = p_keep_contact_id AND m.id = p_merge_contact_id;

    -- Marcar como merged
    UPDATE wa_contacts SET
        merged_into = p_keep_contact_id,
        is_active = false,
        identity_status = 'merged',
        updated_at = NOW()
    WHERE id = p_merge_contact_id;

    -- Log
    INSERT INTO identity_merge_log (organization_id, from_contact_id, to_contact_id, reason, merged_by)
    VALUES (p_org_id, p_merge_contact_id, p_keep_contact_id, p_reason, p_merged_by);

    -- Histórico
    INSERT INTO wa_contact_history (contact_id, organization_id, action, description, actor_type, actor_id)
    VALUES (p_keep_contact_id, p_org_id, 'contact_merged',
        'Contato ' || p_merge_contact_id || ' foi mesclado neste contato',
        CASE WHEN p_merged_by = 'system' THEN 'system' ELSE 'user' END,
        p_merged_by);
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 22. FUNCTION: Get enriched contact with lead/mentorado/financial data
-- =====================================================================
CREATE OR REPLACE FUNCTION get_wa_contact_enriched(p_contact_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'contact', jsonb_build_object(
            'id', wc.id,
            'display_name', wc.display_name,
            'phone_number', wc.phone_number,
            'identity_status', wc.identity_status,
            'tags', wc.tags,
            'pipeline_stage', wc.pipeline_stage,
            'custom_fields', wc.custom_fields,
            'created_at', wc.created_at
        ),
        'lead', CASE WHEN l.id IS NOT NULL THEN jsonb_build_object(
            'id', l.id,
            'nome', l.nome_completo,
            'email', l.email,
            'status', l.status,
            'temperatura', l.temperatura,
            'lead_score', l.lead_score,
            'valor_vendido', l.valor_vendido,
            'valor_arrecadado', l.valor_arrecadado,
            'origem', l.origem,
            'data_venda', l.data_venda,
            'observacoes', l.observacoes,
            'created_at', l.created_at
        ) ELSE NULL END,
        'mentorado', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
            'id', m.id,
            'nome', m.nome_completo,
            'email', m.email,
            'status', m.status,
            'turma', m.turma,
            'data_entrada', m.data_entrada,
            'created_at', m.created_at
        ) ELSE NULL END,
        'financeiro', (
            SELECT jsonb_build_object(
                'total_dividas', COALESCE(SUM(d.valor), 0),
                'total_pago', COALESCE(SUM(d.valor_pago), 0),
                'total_pendente', COALESCE(SUM(CASE WHEN d.status = 'pendente' THEN d.valor ELSE 0 END), 0),
                'total_atrasado', COALESCE(SUM(CASE WHEN d.status = 'atrasado' THEN d.valor ELSE 0 END), 0),
                'dividas_pendentes', COUNT(*) FILTER (WHERE d.status IN ('pendente', 'atrasado')),
                'ultima_cobranca', MAX(d.data_vencimento)
            )
            FROM dividas d
            WHERE d.mentorado_id = wc.mentorado_id
        ),
        'identifiers', (
            SELECT jsonb_agg(jsonb_build_object(
                'jid', ci.jid,
                'jid_type', ci.jid_type,
                'is_primary', ci.is_primary
            ))
            FROM contact_identifiers ci WHERE ci.contact_id = wc.id
        )
    ) INTO v_result
    FROM wa_contacts wc
    LEFT JOIN leads l ON l.id = wc.lead_id
    LEFT JOIN mentorados m ON m.id = wc.mentorado_id
    WHERE wc.id = p_contact_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 23. Migrate existing default instance
-- =====================================================================
INSERT INTO whatsapp_instances (id, organization_id, name, department, status, session_path)
SELECT
    gen_random_uuid(),
    o.id,
    'Principal',
    'CS',
    'disconnected',
    'user_' || o.id
FROM organizations o
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 24. Migrate existing lid_phone_mappings to new table
-- =====================================================================
INSERT INTO wa_lid_mappings (pn_jid, lid_jid, confidence, source)
SELECT
    real_phone || '@s.whatsapp.net',
    lid_id,
    'high',
    'migrated_from_legacy'
FROM lid_phone_mappings
WHERE lid_id IS NOT NULL AND real_phone IS NOT NULL
ON CONFLICT (lid_jid) DO NOTHING;

-- =====================================================================
-- 25. Add FK Map entries for db.js compatibility
-- =====================================================================
-- (handled in backend code)

-- Done!
SELECT 'Migration 29 completed: WhatsApp System Overhaul' AS result;
