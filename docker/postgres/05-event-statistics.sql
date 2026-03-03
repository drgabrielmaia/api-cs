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

-- =====================================================================
-- get_contracts_dashboard - Contract listing for admin/contratos page
-- =====================================================================
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

-- =====================================================================
-- add_event_participant - Add participant to a group event
-- =====================================================================
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

-- =====================================================================
-- convert_event_participant - Mark participant as converted
-- =====================================================================
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

-- =====================================================================
-- Contract functions
-- =====================================================================

-- get_contract_content - Get contract content for viewing
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

-- get_contract_for_signing - Get contract data for the signing page
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

-- sign_contract_simple - Simple contract signing
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

-- sign_contract - Full contract signing with signature data
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

-- create_contract_from_template - Create a new contract from template
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
    -- Get template content
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

-- create_default_contract_template - Create default template for org
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

-- expire_old_contracts - Expire contracts past their expiration date
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
