-- 27-contract-payment-fields.sql
-- Add payment tracking fields to contracts table

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(10,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS valor_restante NUMERIC(10,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS forma_negociacao TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS data_contrato DATE DEFAULT CURRENT_DATE;

-- Update get_contracts_dashboard to return payment fields
DROP FUNCTION IF EXISTS get_contracts_dashboard(uuid,text,integer);

CREATE OR REPLACE FUNCTION get_contracts_dashboard(
    p_organization_id UUID,
    p_status TEXT DEFAULT 'all',
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    id UUID,
    template_name TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    lead_id UUID,
    whatsapp_sent_at TIMESTAMPTZ,
    mentorado_id UUID,
    valor NUMERIC,
    valor_pago NUMERIC,
    valor_restante NUMERIC,
    forma_negociacao TEXT,
    data_contrato DATE,
    recipient_phone TEXT
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
        NULL::TIMESTAMPTZ AS whatsapp_sent_at,
        c.mentorado_id,
        c.valor,
        c.valor_pago,
        c.valor_restante,
        c.forma_negociacao,
        c.data_contrato,
        COALESCE(l.telefone, m.telefone) AS recipient_phone
    FROM contracts c
    LEFT JOIN contract_templates ct ON ct.id = c.template_id
    LEFT JOIN leads l ON l.id = c.lead_id
    LEFT JOIN mentorados m ON m.id = c.mentorado_id
    WHERE c.organization_id = p_organization_id
      AND (p_status IS NULL OR p_status = 'all' OR c.status = p_status)
    ORDER BY c.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
