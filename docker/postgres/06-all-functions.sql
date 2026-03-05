-- =====================================================================
-- ALL MISSING FUNCTIONS - Run on existing database
-- This applies all functions from 01-schema.sql + 05-event-statistics.sql
-- Safe to run multiple times (CREATE OR REPLACE)
-- =====================================================================

-- 0. Utility
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Calculate closer metrics
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

-- 2. Calculate commission
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

-- 3. Process referral conversion
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

-- 4. Initialize default kanban
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

-- 5. Get kanban board data
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

-- 6. Move kanban task
CREATE OR REPLACE FUNCTION move_kanban_task(
    p_task_id UUID,
    p_target_column_id UUID,
    p_new_order INTEGER
) RETURNS VOID AS $$
BEGIN
    UPDATE kanban_tasks SET column_id = p_target_column_id, task_order = p_new_order WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Update continue watching
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

-- 8. Process mentorado churn
CREATE OR REPLACE FUNCTION process_mentorado_churn(
    p_mentorado_id UUID,
    p_tipo_exclusao TEXT DEFAULT NULL,
    p_motivo TEXT DEFAULT NULL,
    p_excluido_por_email TEXT DEFAULT NULL,
    p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
BEGIN
    UPDATE mentorados
    SET estado_atual = 'churn',
        status_login = 'inativo',
        motivo_exclusao = COALESCE(p_tipo_exclusao, p_motivo),
        data_exclusao = NOW(),
        excluido = true,
        updated_at = NOW()
    WHERE id = p_mentorado_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Mentorado não encontrado'::text;
        RETURN;
    END IF;

    BEGIN
        INSERT INTO mentorado_churns (mentorado_id, tipo_exclusao, motivo, data_exclusao, excluido_por_email, organization_id)
        VALUES (p_mentorado_id, p_tipo_exclusao, p_motivo, NOW(), p_excluido_por_email, p_organization_id);
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    RETURN QUERY SELECT true, 'Exclusão processada com sucesso'::text;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- EVENT & CONTRACT FUNCTIONS (from 05-event-statistics.sql)
-- =====================================================================

-- Add conversion_value column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'group_event_participants' AND column_name = 'conversion_value'
    ) THEN
        ALTER TABLE group_event_participants ADD COLUMN conversion_value NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 9. Get contracts dashboard
CREATE OR REPLACE FUNCTION get_contracts_dashboard(
    p_organization_id UUID,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    template_name TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    lead_id UUID,
    whatsapp_sent_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        COALESCE(ct.name, 'Sem template') AS template_name,
        COALESCE(l.nome_completo, m.nome_completo, c.assinado_por, 'N/A') AS recipient_name,
        COALESCE(l.email, m.email, '') AS recipient_email,
        c.status,
        c.created_at,
        c.data_assinatura AS signed_at,
        c.expira_em AS expires_at,
        c.lead_id,
        NULL::TIMESTAMPTZ AS whatsapp_sent_at
    FROM contracts c
    LEFT JOIN contract_templates ct ON ct.id = c.template_id
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN mentorados m ON m.id = c.mentorado_id
    WHERE c.organization_id = p_organization_id
      AND (p_status IS NULL OR p_status = 'all' OR c.status = p_status)
    ORDER BY c.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 10. Add event participant
CREATE OR REPLACE FUNCTION add_event_participant(
    p_event_id UUID,
    p_participant_name TEXT,
    p_organization_id UUID,
    p_participant_email TEXT DEFAULT NULL,
    p_participant_phone TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT, participant_id UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO group_event_participants (event_id, nome, email, telefone, status, attended, converted)
    VALUES (p_event_id, p_participant_name, p_participant_email, p_participant_phone, 'registered', false, false)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT true, 'Participante adicionado com sucesso'::TEXT, v_id;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- 11. Convert event participant
CREATE OR REPLACE FUNCTION convert_event_participant(
    p_participant_id UUID,
    p_conversion_type TEXT DEFAULT 'sale',
    p_conversion_value NUMERIC DEFAULT NULL,
    p_product_service TEXT DEFAULT NULL,
    p_attributed_to_email TEXT DEFAULT NULL,
    p_commission_percentage NUMERIC DEFAULT 0
)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
BEGIN
    UPDATE group_event_participants
    SET converted = true,
        conversion_value = COALESCE(p_conversion_value, 0),
        notes = COALESCE(notes, '') || ' | Conversão: ' || p_conversion_type ||
                COALESCE(' - ' || p_product_service, '') ||
                ' (por ' || COALESCE(p_attributed_to_email, 'N/A') || ')'
    WHERE id = p_participant_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Participante não encontrado'::TEXT;
    ELSE
        RETURN QUERY SELECT true, 'Participante convertido com sucesso'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 12. Get contract content
CREATE OR REPLACE FUNCTION get_contract_content(p_contract_id UUID)
RETURNS TABLE (
    id UUID,
    content TEXT,
    status TEXT,
    template_name TEXT,
    recipient_name TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content,
        c.status,
        COALESCE(ct.name, 'Sem template') AS template_name,
        COALESCE(l.nome_completo, m.nome_completo, c.assinado_por, 'N/A') AS recipient_name,
        c.created_at
    FROM contracts c
    LEFT JOIN contract_templates ct ON ct.id = c.template_id
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN mentorados m ON m.id = c.mentorado_id
    WHERE c.id = p_contract_id;
END;
$$ LANGUAGE plpgsql;

-- 13. Get contract for signing
CREATE OR REPLACE FUNCTION get_contract_for_signing(p_contract_id UUID)
RETURNS TABLE (
    id UUID,
    content TEXT,
    status TEXT,
    template_name TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    organization_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content,
        c.status,
        COALESCE(ct.name, 'Contrato') AS template_name,
        COALESCE(l.nome_completo, m.nome_completo, 'N/A') AS recipient_name,
        COALESCE(l.email, m.email, '') AS recipient_email,
        c.expira_em AS expires_at,
        c.created_at,
        COALESCE(o.name, '') AS organization_name
    FROM contracts c
    LEFT JOIN contract_templates ct ON ct.id = c.template_id
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN mentorados m ON m.id = c.mentorado_id
    LEFT JOIN organizations o ON o.id = c.organization_id
    WHERE c.id = p_contract_id;
END;
$$ LANGUAGE plpgsql;

-- 14. Sign contract simple
CREATE OR REPLACE FUNCTION sign_contract_simple(
    p_contract_id UUID,
    p_signer_name TEXT,
    p_signer_ip TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
BEGIN
    UPDATE contracts
    SET status = 'signed',
        data_assinatura = NOW(),
        assinado_por = p_signer_name,
        ip_assinatura = p_signer_ip,
        updated_at = NOW()
    WHERE id = p_contract_id AND status != 'signed';

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Contrato não encontrado ou já assinado'::TEXT;
    ELSE
        INSERT INTO contract_audit_log (contract_id, action, details, performed_by, ip_address)
        VALUES (p_contract_id, 'signed', jsonb_build_object('signer_name', p_signer_name), p_signer_name, p_signer_ip);
        RETURN QUERY SELECT true, 'Contrato assinado com sucesso'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 15. Sign contract (with signature data)
CREATE OR REPLACE FUNCTION sign_contract(
    p_contract_id UUID,
    p_signer_name TEXT,
    p_signature_data JSONB DEFAULT NULL,
    p_signer_ip TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
BEGIN
    UPDATE contracts
    SET status = 'signed',
        data_assinatura = NOW(),
        assinado_por = p_signer_name,
        ip_assinatura = p_signer_ip,
        signature_data = p_signature_data,
        updated_at = NOW()
    WHERE id = p_contract_id AND status != 'signed';

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Contrato não encontrado ou já assinado'::TEXT;
    ELSE
        INSERT INTO contract_audit_log (contract_id, action, details, performed_by, ip_address)
        VALUES (p_contract_id, 'signed', jsonb_build_object('signer_name', p_signer_name, 'has_signature', p_signature_data IS NOT NULL), p_signer_name, p_signer_ip);
        RETURN QUERY SELECT true, 'Contrato assinado com sucesso'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 16. Create contract from template
CREATE OR REPLACE FUNCTION create_contract_from_template(
    p_template_id UUID,
    p_organization_id UUID,
    p_lead_id UUID DEFAULT NULL,
    p_mentorado_id UUID DEFAULT NULL,
    p_recipient_name TEXT DEFAULT NULL,
    p_recipient_email TEXT DEFAULT NULL,
    p_custom_content TEXT DEFAULT NULL,
    p_expires_days INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
    v_content TEXT;
    v_contract_id UUID;
BEGIN
    IF p_custom_content IS NOT NULL THEN
        v_content := p_custom_content;
    ELSE
        SELECT content INTO v_content FROM contract_templates WHERE id = p_template_id;
    END IF;

    INSERT INTO contracts (template_id, lead_id, mentorado_id, organization_id, content, status, expira_em)
    VALUES (p_template_id, p_lead_id, p_mentorado_id, p_organization_id, v_content, 'pending', NOW() + (p_expires_days || ' days')::INTERVAL)
    RETURNING id INTO v_contract_id;

    INSERT INTO contract_audit_log (contract_id, action, details, performed_by)
    VALUES (v_contract_id, 'created', jsonb_build_object('template_id', p_template_id, 'lead_id', p_lead_id), 'system');

    RETURN v_contract_id;
END;
$$ LANGUAGE plpgsql;

-- 17. Create default contract template
CREATE OR REPLACE FUNCTION create_default_contract_template(p_organization_id UUID)
RETURNS TABLE (id UUID, name TEXT) AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO contract_templates (organization_id, name, content, is_default)
    VALUES (p_organization_id, 'Contrato Padrão', 'Contrato de prestação de serviços...', true)
    ON CONFLICT DO NOTHING
    RETURNING contract_templates.id INTO v_id;

    IF v_id IS NULL THEN
        SELECT ct.id INTO v_id FROM contract_templates ct
        WHERE ct.organization_id = p_organization_id AND ct.is_default = true LIMIT 1;
    END IF;

    RETURN QUERY SELECT v_id, 'Contrato Padrão'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 18. Expire old contracts
CREATE OR REPLACE FUNCTION expire_old_contracts()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE contracts
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expira_em < NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 19. Event statistics
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
        (SELECT COUNT(*) FROM group_events WHERE organization_id = p_organization_id)::BIGINT,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id)::BIGINT,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.attended = true)::BIGINT,
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
        END,
        (SELECT COUNT(*) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.converted = true)::BIGINT,
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
        END,
        COALESCE((SELECT SUM(COALESCE(gep.conversion_value, 0)) FROM group_event_participants gep
         JOIN group_events ge ON ge.id = gep.event_id
         WHERE ge.organization_id = p_organization_id AND gep.converted = true), 0),
        CASE
            WHEN (SELECT COUNT(*) FROM group_event_participants gep
                  JOIN group_events ge ON ge.id = gep.event_id
                  WHERE ge.organization_id = p_organization_id AND gep.converted = true) = 0 THEN 0
            ELSE ROUND(
                COALESCE((SELECT AVG(COALESCE(gep.conversion_value, 0)) FROM group_event_participants gep
                 JOIN group_events ge ON ge.id = gep.event_id
                 WHERE ge.organization_id = p_organization_id AND gep.converted = true), 0), 2)
        END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- ALL FUNCTIONS APPLIED
-- =====================================================================
