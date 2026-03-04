-- =====================================================================
-- Migration 21: Seed ICP form template
-- Creates a default ICP (Ideal Customer Profile) form template
-- =====================================================================

INSERT INTO icp_form_templates (organization_id, titulo, descricao, campos, ativo)
VALUES (
    '9c8c0033-15ea-4e33-a55f-28d81a19693b',
    'Perfil do Cliente Ideal',
    'Formulário para mapear seu perfil profissional e objetivos na mentoria',
    '[
        {
            "id": "especialidade_principal",
            "label": "Qual é a sua especialidade médica principal?",
            "type": "text",
            "required": true,
            "placeholder": "Ex: Cardiologia, Dermatologia..."
        },
        {
            "id": "tempo_formacao",
            "label": "Há quanto tempo você se formou?",
            "type": "select",
            "required": true,
            "options": ["Menos de 1 ano", "1 a 3 anos", "3 a 5 anos", "5 a 10 anos", "Mais de 10 anos"]
        },
        {
            "id": "tipo_atendimento",
            "label": "Qual o seu principal tipo de atendimento?",
            "type": "select",
            "required": true,
            "options": ["Consultório próprio", "Clínica", "Hospital", "Plano de saúde", "Particular", "Misto"]
        },
        {
            "id": "faturamento_atual",
            "label": "Qual o seu faturamento mensal atual (aproximado)?",
            "type": "select",
            "required": true,
            "options": ["Até R$ 10.000", "R$ 10.000 a R$ 20.000", "R$ 20.000 a R$ 50.000", "R$ 50.000 a R$ 100.000", "Acima de R$ 100.000"]
        },
        {
            "id": "meta_faturamento",
            "label": "Qual a sua meta de faturamento mensal?",
            "type": "select",
            "required": true,
            "options": ["R$ 20.000", "R$ 50.000", "R$ 100.000", "R$ 200.000", "Acima de R$ 200.000"]
        },
        {
            "id": "maior_dificuldade",
            "label": "Qual a sua maior dificuldade hoje no consultório?",
            "type": "select",
            "required": true,
            "options": ["Captar novos pacientes", "Fidelizar pacientes", "Gestão financeira", "Marketing digital", "Precificação", "Gestão de equipe", "Falta de tempo"]
        },
        {
            "id": "canais_captacao",
            "label": "Quais canais você usa para captar pacientes?",
            "type": "multiselect",
            "required": true,
            "options": ["Instagram", "Google/SEO", "Indicação de pacientes", "Convênios", "Doctoralia/Plataformas", "Anúncios pagos", "Nenhum atualmente"]
        },
        {
            "id": "tem_equipe",
            "label": "Você possui equipe/secretária?",
            "type": "select",
            "required": true,
            "options": ["Sim, equipe completa", "Sim, apenas secretária", "Não, trabalho sozinho(a)", "Estou montando equipe"]
        },
        {
            "id": "objetivo_mentoria",
            "label": "Qual o seu principal objetivo com a mentoria?",
            "type": "textarea",
            "required": true,
            "placeholder": "Descreva o que você espera alcançar..."
        },
        {
            "id": "disponibilidade_semanal",
            "label": "Quantas horas por semana você pode dedicar à mentoria?",
            "type": "select",
            "required": true,
            "options": ["Menos de 2 horas", "2 a 5 horas", "5 a 10 horas", "Mais de 10 horas"]
        }
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Also populate the English alias columns
UPDATE icp_form_templates
SET name = titulo, description = descricao, fields = campos, is_active = ativo
WHERE name IS NULL AND titulo IS NOT NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 21 complete — ICP template seeded'; END $$;
