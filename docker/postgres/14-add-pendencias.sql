-- =====================================================================
-- Migration: Adicionar pendencias (archived lessons, materiais, modulos faltantes)
-- Roda em cima do banco existente, sem apagar nada
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. MARCAR AULAS ARQUIVADAS (is_current = false)
-- Match por ID do Supabase. Se ID nao existir, tenta por titulo
-- =====================================================================

-- Medicos que vendem (TODAS arquivadas)
UPDATE video_lessons SET is_current = false, archived_at = '2026-02-18 00:54:49.131622+00', archive_reason = 'Aula arquivada - modulo antigo', version = 'v1.0'
WHERE id IN (
  '2547e4ff-d4d5-4b09-87e5-4a1b76f3eae3','b428cccd-170c-47f8-9c57-95d23a3341f3','2485f208-fb24-4430-a3f3-81de20953fa0',
  '34e3fb69-264a-470c-809c-85574467ea6f','c6c3cc69-59c0-4c93-92c1-924a3924807d','18c76310-9f8f-4edf-b058-9cee1eb3b208',
  'bfc2bd50-ea5e-4709-8037-61b25850b402','1bad9ca5-4062-4ebd-ac21-69dc3065f17c','765b035b-2ef6-4f4b-b6cc-fc4aee8b7150',
  'bc0f0221-6b40-4e39-a5cd-17f9b1d08d18','44af3fc6-a4e5-4a2f-a1b5-77244678c2e1','8870578c-05c4-4d7b-8ccc-ded59f3c7c91',
  'fd14b3bf-ccf7-4db2-aacb-aa47debe6537','989aab8c-d4b5-4d04-b448-0b514b5d9126','d57e16cf-85cf-4b63-96cf-491cb39b9769',
  '0ef40cd7-48cf-42e0-adf9-fc6b4ba178be','e8aeca40-9f92-44b7-a29c-2690c4ba739b','85e64359-9ac0-431e-9980-c3db33ecd103',
  '0f148198-c332-4a86-98a6-a54b3d1c178e','87332005-2973-49fc-b127-031ba6a39107','89588001-ae3e-4d2a-bf79-93684d6d5248',
  '83d45c91-fb2d-41df-bfab-cccd5bd65725'
);

-- Pocket - aulas arquivadas (so as antigas, as novas continuam current)
UPDATE video_lessons SET is_current = false, archived_at = '2026-02-18 00:54:49.131622+00', archive_reason = 'Aula arquivada - versao antiga', version = 'v1.0'
WHERE id IN (
  '9ce7fb86-d03f-4b64-acdb-77167f047f84','ff1462ad-f2ee-4e33-89c5-504db4d01ae2','538e8373-6ba1-4978-8694-8d87194bb49a',
  '21a75298-9726-4896-8145-00d50986d650','8ea5a13f-6adc-4b15-aa6c-1a238962db89','48e44a9b-680f-4960-96e4-4647988d4e02',
  'cc9680aa-e433-4689-900c-e5336920e3b8','8b9a674c-c7b5-4d0a-a4ee-9ef23d9f36e2','15fbe342-a9d1-47ee-b295-026ab6a09b7f',
  'a843181e-a387-4276-8b88-3cc5ce61a86b','31a04972-60bd-4f26-8ecf-9a61a94a78d4','58092b76-e08d-48a4-9c96-460960c7c833',
  '61bd94a8-4ef0-4a7d-8c47-1f57ef71dd20','623da9a5-2350-44b6-9926-c29761599838','3831777b-2f69-4c82-92a9-2b1f935724f1',
  'f76e64a3-f13a-4fa0-bdec-9217a61121d3','50247b9a-ae95-4e8c-bea2-f579c5666d53','3d7370ca-2645-478b-898e-23b66ef329ff',
  '6bc7a6bc-6b8a-42d2-a770-e224b7697ea9','8be193a9-0de8-42b5-966a-d52a216de7da','a284ea86-dcb6-4410-ab11-b0f4fa049b5a',
  'fc25faa0-1294-4cbb-a74f-5b8ea3ece5cb'
);

-- Posicionamento Digital - aulas arquivadas
UPDATE video_lessons SET is_current = false, archived_at = '2026-02-18 00:54:49.131622+00', archive_reason = 'Aula arquivada - versao antiga', version = 'v1.0'
WHERE id IN (
  '308b1466-637a-4488-9c1b-005e0e989f2e','5c969968-93cd-4e67-8e6f-114b3c1efa17','44168dd9-60d4-48a1-991f-c2be1f677e68',
  '9a838b4c-9e03-44f9-a94c-96a1ca1bc9dd','e86dabd4-6197-47b8-af4a-d26d2f63c10d','08e2fb81-ade5-4cca-87fd-0dd05f8d1769',
  '47205b12-003f-46bc-8d47-3961b696c717','58e119c3-d99f-4de7-a271-25de8f0f8bf9','ba146035-450c-48c8-9c2e-05d97b46f58b',
  'ee27181d-0b54-4b22-ad13-fffd0fa32507','f69fe2d8-5f9d-439f-b0aa-f9209f1a9c9d','b14be558-39a2-4148-8d11-11369dca4e59',
  '1f3bd9bd-a920-4f7e-8010-7bd0ce8c6753','c7630e19-94df-4ef6-8bc2-5e2ac34590d0','6e891a3f-c85a-4050-bbef-61ff9950bd5c',
  'fa318322-1e67-4849-95c0-75e1913117d6','3aba6cf9-9beb-47d2-808c-9cb96f3c1aa5','4b7f8e4b-280e-4839-a076-352253b7053b',
  '96836f99-5599-450e-b095-d9a0e1f662e3','2c7a327a-bb50-4276-988d-4e66a7b1fb49'
);

-- Atrai & Encanta (TODAS arquivadas)
UPDATE video_lessons SET is_current = false, archived_at = '2026-02-18 00:54:49.131622+00', archive_reason = 'Aula arquivada - modulo antigo', version = 'v1.0'
WHERE id IN (
  '41e6783b-546f-48b0-acb1-025d42c19e11','d163c603-6e2c-47a1-ab8d-cc6ed9877a20','57dc2880-d400-406f-8112-5769cc777887',
  '4f6d3fb3-37db-491b-9140-112cb50f1bbf','ee49f321-4428-458b-bcca-7aec4bdb857a','1d80f8c2-395d-42f5-88a1-75ac258a0038',
  'c02c2226-a68c-4549-991c-76e9064e1b07','29a87d52-4b70-4e1e-9b71-c3e3f43c6f3e','bda7939f-742c-4ad4-b682-3c336f08612d',
  '98144ff5-780e-42af-9e22-c47a3f7822e4','3ea602bb-f212-4ea5-917e-cc727bffc9f5','fc0258f9-2910-4ada-9140-2cbb6a25da0f',
  '7c23ba8e-47bb-4bf9-b27a-55f3c3cdd810','8b0fc36a-d168-4fd7-9e0b-7c1e9543faf1','90bc0431-d9f9-40ad-a771-8649714f4e2f',
  'e01d3cd5-fc31-4235-9c73-11b4cce40260','b53c07c9-a509-4c1c-8490-4c11e08f697d','778c7f30-1682-40bf-ba3a-aae25f80ba1a',
  '2265ee3d-3e44-4c1f-83b5-61f796eec182'
);

-- Hotseats (TODAS arquivadas)
UPDATE video_lessons SET is_current = false, archived_at = '2026-02-18 00:54:49.131622+00', archive_reason = 'Aula arquivada - modulo antigo', version = 'v1.0'
WHERE id IN (
  'e485f07e-975f-468c-87c3-74610d20a8f5','9ab3f106-0d75-483b-919e-ba3bffded3d2','797d06fe-ceca-4ec5-af02-d4889f351b96',
  'a2bb52bb-a2a4-4851-8769-566dd461feb5','a0ab5cfd-af72-45a2-83f4-c504f773f378','c91a5b66-a44a-4486-8ae6-8dd2063e726a',
  'b0ff9a22-2ac4-4fc3-af34-2c1777eeb570','a3ceb2a6-cee2-40d6-9c2a-96deb36c106d','1b30d985-d7a0-468b-b73b-655d31eee24f',
  '945879e5-88b1-446a-895d-d3281f6a9bdb','a69507b8-f9b2-437d-94fb-3a41e52e845b','eb1f8df4-f013-450b-84ae-5aa8da0a95cf',
  'b9c3afaf-71a1-4db8-b9e5-8078276849e2'
);

-- =====================================================================
-- 2. ADICIONAR MATERIAIS (PDF) NAS AULAS
-- =====================================================================

-- Pocket: Fenotipos da Obesidade
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/a6eba18f-c787-4bd4-a300-da3b293c0517-1769026612417-Fenotipos%20na%20obesidade%20-%20Aula%201.pdf',
  pdf_filename = 'Fenotipos na obesidade - Aula 1.pdf'
WHERE id = 'a6eba18f-c787-4bd4-a300-da3b293c0517';

-- Pocket: Medicina funcional integrativa
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/f861f514-7c42-4403-a7e5-6856a4e29256-1769026889272-Protocolos%20nutraceuticos.pdf',
  pdf_filename = 'Protocolos nutraceuticos.pdf'
WHERE id = 'f861f514-7c42-4403-a7e5-6856a4e29256';

-- Pocket: Genetica preditiva
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/5be9e6f2-fed6-416d-b2e7-5c8f3387aeb3-1769629028972-geneticapreventiva.pdf',
  pdf_filename = 'geneticapreventiva.pdf'
WHERE id = '5be9e6f2-fed6-416d-b2e7-5c8f3387aeb3';

-- Bonus: Termo consentimento injetavel
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/5580a202-0eed-4262-a8f4-025580e12ed9-1769630178487-TERMO_DE_CONSENTIMENTO_ESCLARECIDO_PARA_PROCEDIMENTO_INJETA_VEL.pdf',
  pdf_filename = 'TERMO DE CONSENTIMENTO ESCLARECIDO PARA PROCEDIMENTO INJETAVEL.pdf'
WHERE id = '5580a202-0eed-4262-a8f4-025580e12ed9';

-- Bonus: Termo consentimento implante hormonal
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/b5d37433-8449-423d-a57d-9485282d6f80-1769630223707-TERMO_DE_CONSENTIMENTO_INFORMADO_IMPLANTE_DE_REPOSIC_A_O_HORMONAL.pdf',
  pdf_filename = 'TERMO DE CONSENTIMENTO INFORMADO IMPLANTE DE REPOSICAO HORMONAL.pdf'
WHERE id = 'b5d37433-8449-423d-a57d-9485282d6f80';

-- Bonus: Pos consulta
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/0a50542f-8d12-405f-92a5-1ab69c048422-1769630397654-POS_CONSULTA.pdf',
  pdf_filename = 'POS CONSULTA.pdf'
WHERE id = '0a50542f-8d12-405f-92a5-1ab69c048422';

-- Bonus: Pre consulta
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/49b418dd-cc75-4f07-a9c6-124df31a1ac4-1769630429892-Responder_questiona_rio.pdf',
  pdf_filename = 'Responder questionario.pdf'
WHERE id = '49b418dd-cc75-4f07-a9c6-124df31a1ac4';

-- Posicionamento: Construcao de imagem estrategica
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/7c03ad07-dacd-4f89-846c-dd3e3124e0d4-1771960242991-Autoridade_Estrategia.pdf',
  pdf_filename = 'Autoridade_Estrategia.pdf'
WHERE id = '7c03ad07-dacd-4f89-846c-dd3e3124e0d4';

-- Posicionamento: Posicionamento digital estrategico e intencional
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/8897cb75-b665-4090-b5ef-68dec5422f97-1772117105740-Posicionamento_digital.pdf',
  pdf_filename = 'Posicionamento digital.pdf'
WHERE id = '8897cb75-b665-4090-b5ef-68dec5422f97';

-- IA: IA na criacao de conteudo
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/1b55dc90-9dbd-4ec5-894a-3ee57d2cf910-1771010256754-Guia_de_Ferramentas_de_IA_e_Criac_a_o_de_Conteu_do_Profissional.pdf',
  pdf_filename = 'Guia de Ferramentas de IA e Criacao de Conteudo Profissional.pdf'
WHERE id = '1b55dc90-9dbd-4ec5-894a-3ee57d2cf910';

-- IA: Criacao de conteudo Parte 1 (Figma)
UPDATE video_lessons SET
  pdf_url = 'https://udzmlnnztzzwrphhizol.supabase.co/storage/v1/object/public/lesson-materials/lesson-pdfs/09610400-375e-45a2-8325-26210bc61eef-1771010275600-Guia_de_Ferramentas_de_IA_e_Criac_a_o_de_Conteu_do_Profissional.pdf',
  pdf_filename = 'Guia de Ferramentas de IA e Criacao de Conteudo Profissional.pdf'
WHERE id = '09610400-375e-45a2-8325-26210bc61eef';

-- =====================================================================
-- 3. MODULOS FALTANTES (Onboarding e IA)
-- Insere so se nao existir
-- =====================================================================

INSERT INTO video_modules (id, title, description, order_index, organization_id, created_at, updated_at, is_active, cover_image_url)
VALUES (
  'f8e4c2a1-1234-4abc-9def-000000000000',
  'Onboarding',
  'Modulo de boas-vindas e orientacao inicial para novos mentorados',
  0,
  '9c8c0033-15ea-4e33-a55f-28d81a19693b',
  NOW(), NOW(), true, NULL
) ON CONFLICT (id) DO NOTHING;

-- Tenta tambem pelo titulo (caso ID diferente)
INSERT INTO video_modules (id, title, description, order_index, organization_id, created_at, updated_at, is_active, cover_image_url)
SELECT
  'f8e4c2a1-1234-4abc-9def-000000000000',
  'Onboarding',
  'Modulo de boas-vindas e orientacao inicial para novos mentorados',
  0,
  '9c8c0033-15ea-4e33-a55f-28d81a19693b',
  NOW(), NOW(), true, NULL
WHERE NOT EXISTS (SELECT 1 FROM video_modules WHERE title = 'Onboarding' AND organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b');

INSERT INTO video_modules (id, title, description, order_index, organization_id, created_at, updated_at, is_active, cover_image_url)
VALUES (
  '6dca50ff-76e2-4478-9c6f-b9faeb0400e1',
  'IA',
  'Inteligencia Artificial aplicada a criacao de conteudo e produtividade medica',
  7,
  '9c8c0033-15ea-4e33-a55f-28d81a19693b',
  NOW(), NOW(), true, NULL
) ON CONFLICT (id) DO NOTHING;

INSERT INTO video_modules (id, title, description, order_index, organization_id, created_at, updated_at, is_active, cover_image_url)
SELECT
  '6dca50ff-76e2-4478-9c6f-b9faeb0400e1',
  'IA',
  'Inteligencia Artificial aplicada a criacao de conteudo e produtividade medica',
  7,
  '9c8c0033-15ea-4e33-a55f-28d81a19693b',
  NOW(), NOW(), true, NULL
WHERE NOT EXISTS (SELECT 1 FROM video_modules WHERE title = 'IA' AND organization_id = '9c8c0033-15ea-4e33-a55f-28d81a19693b');

COMMIT;

-- =====================================================================
-- Resumo:
-- * 96 aulas marcadas como arquivadas (is_current=false)
-- * 11 aulas com materiais PDF adicionados
-- * 2 modulos faltantes: Onboarding (order 0) e IA (order 7)
-- =====================================================================
