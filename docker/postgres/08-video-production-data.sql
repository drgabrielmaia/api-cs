-- ============================================================
-- 08 - Video Modules & Lessons - Production Data
-- Date: 2026-03-03
-- Run: docker exec -i cssystem-db psql -U postgres -d cssystem < docker/postgres/08-video-production-data.sql
-- ============================================================

-- ============================================================
-- STEP 1: Add missing columns that frontend code expects
-- (07-schema-fixes already adds order_index on video_modules
--  and has_access on video_access_control)
-- ============================================================

-- video_modules: frontend uses "is_active" (schema has "is_published")
ALTER TABLE video_modules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE video_modules SET is_active = is_published WHERE is_active IS NULL;

-- video_lessons: frontend uses "order_index" (schema has "lesson_order")
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
UPDATE video_lessons SET order_index = lesson_order WHERE order_index = 0 AND lesson_order != 0;

-- video_lessons: frontend uses "is_active" (schema has "is_published")
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE video_lessons SET is_active = is_published WHERE is_active IS NULL;

-- video_lessons: frontend uses "panda_video_embed_url" (schema has "video_url")
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS panda_video_embed_url TEXT;

-- video_lessons: frontend uses "duration_minutes" (schema has "duration_seconds")
ALTER TABLE video_lessons ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 0;

-- lesson_progress: frontend uses "started_at", "watch_time_minutes", "is_completed"
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS watch_time_minutes INTEGER DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- ============================================================
-- STEP 2: Clean existing video data for this organization
-- ============================================================

DELETE FROM video_modules WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

-- ============================================================
-- STEP 3: Insert all 7 modules and their lessons
-- ============================================================

DO $$
DECLARE
  org_id UUID := 'a0000000-0000-4000-8000-000000000001';
  mod_onboarding UUID;
  mod_pocket UUID;
  mod_posicionamento UUID;
  mod_atrai UUID;
  mod_bonus UUID;
  mod_vendem UUID;
  mod_hotseats UUID;
BEGIN

  -- ==========================================================
  -- MODULE 1: Onboarding
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Onboarding', 'Boas-vindas e primeiros passos na mentoria.', 1, 1, true, true, false, org_id)
  RETURNING id INTO mod_onboarding;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_onboarding, 'Sua chave começa a virar agora!', '', 'dc4b635c-ce6a-4ded-9935-f499393e5240', 'dc4b635c-ce6a-4ded-9935-f499393e5240', 15, 900, 1, 1, true, true, true, org_id),
    (mod_onboarding, 'Abertura', '', '912a4bfd-761e-4bd5-a37c-ffc2245ff684', '912a4bfd-761e-4bd5-a37c-ffc2245ff684', 10, 600, 2, 2, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 2: Médicos de Resultado - Pocket
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Médicos de Resultado - Pocket', 'Protocolos práticos de obesidade, medicina funcional, hormônios, lipedema e mais.', 2, 2, true, true, true, org_id)
  RETURNING id INTO mod_pocket;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_pocket, 'Obesidade na Prática', '', '9ce7fb86-d03f-4b64-acdb-77167f047f84', '9ce7fb86-d03f-4b64-acdb-77167f047f84', 45, 2700, 1, 1, true, true, true, org_id),
    (mod_pocket, 'Protocolos Medicina Funcional Integrativa', '', 'ff1462ad-f2ee-4e33-89c5-504db4d01ae2', 'ff1462ad-f2ee-4e33-89c5-504db4d01ae2', 50, 3000, 2, 2, true, true, true, org_id),
    (mod_pocket, 'Reposição hormonal', '', '538e8373-6ba1-4978-8694-8d87194bb49a', '538e8373-6ba1-4978-8694-8d87194bb49a', 40, 2400, 3, 3, true, true, true, org_id),
    (mod_pocket, 'Protocolos injetáveis IM', '', '21a75298-9726-4896-8145-00d50986d650', '21a75298-9726-4896-8145-00d50986d650', 35, 2100, 4, 4, true, true, true, org_id),
    (mod_pocket, 'Protocolos injetáveis IV', '', '8ea5a13f-6adc-4b15-aa6c-1a238962db89', '8ea5a13f-6adc-4b15-aa6c-1a238962db89', 35, 2100, 5, 5, true, true, true, org_id),
    (mod_pocket, 'Protocolo Lipedema', '', '48e44a9b-680f-4960-96e4-4647988d4e02', '48e44a9b-680f-4960-96e4-4647988d4e02', 30, 1800, 6, 6, true, true, true, org_id),
    (mod_pocket, 'Fenótipos da Obesidade', '', 'cc9680aa-e433-4689-900c-e5336920e3b8', 'cc9680aa-e433-4689-900c-e5336920e3b8', 40, 2400, 7, 7, true, true, true, org_id),
    (mod_pocket, 'Funcional integrativa na prática', '', '8b9a674c-c7b5-4d0a-a4ee-9ef23d9f36e2', '8b9a674c-c7b5-4d0a-a4ee-9ef23d9f36e2', 45, 2700, 8, 8, true, true, true, org_id),
    (mod_pocket, 'Hormônios na Prática', '', '15fbe342-a9d1-47ee-b295-026ab6a09b7f', '15fbe342-a9d1-47ee-b295-026ab6a09b7f', 40, 2400, 9, 9, true, true, true, org_id),
    (mod_pocket, 'Implante hormonal - Procedimento prático', '', 'a843181e-a387-4276-8b88-3cc5ce61a86b', 'a843181e-a387-4276-8b88-3cc5ce61a86b', 30, 1800, 10, 10, true, true, true, org_id),
    (mod_pocket, 'Lipedema na prática', '', '31a04972-60bd-4f26-8ecf-9a61a94a78d4', '31a04972-60bd-4f26-8ecf-9a61a94a78d4', 35, 2100, 11, 11, true, true, true, org_id),
    (mod_pocket, 'Intramusculares', '', '58092b76-e08d-48a4-9c96-460960c7c833', '58092b76-e08d-48a4-9c96-460960c7c833', 25, 1500, 12, 12, true, true, true, org_id),
    (mod_pocket, 'Protocolos Injetáveis Extra - Gordura localizada', '', '61bd94a8-4ef0-4a7d-8c47-1f57ef71dd20', '61bd94a8-4ef0-4a7d-8c47-1f57ef71dd20', 30, 1800, 13, 13, true, true, true, org_id),
    (mod_pocket, 'Otimizando o seu tempo com IA', '', '623da9a5-2350-44b6-9926-c29761599838', '623da9a5-2350-44b6-9926-c29761599838', 25, 1500, 14, 14, true, true, true, org_id),
    (mod_pocket, 'Medicina de precisão', '', '3831777b-2f69-4c82-92a9-2b1f935724f1', '3831777b-2f69-4c82-92a9-2b1f935724f1', 40, 2400, 15, 15, true, true, true, org_id),
    (mod_pocket, 'Fenótipos da Obesidade', '', 'f76e64a3-f13a-4fa0-bdec-9217a61121d3', 'f76e64a3-f13a-4fa0-bdec-9217a61121d3', 35, 2100, 16, 16, true, true, true, org_id),
    (mod_pocket, 'Condutas Funcional Integrativa + Emagrecimento', '', '50247b9a-ae95-4e8c-bea2-f579c5666d53', '50247b9a-ae95-4e8c-bea2-f579c5666d53', 45, 2700, 17, 17, true, true, true, org_id),
    (mod_pocket, 'Reposição hormonal na prática', '', '3d7370ca-2645-478b-898e-23b66ef329ff', '3d7370ca-2645-478b-898e-23b66ef329ff', 40, 2400, 18, 18, true, true, true, org_id),
    (mod_pocket, 'Intramusculares na prática', '', '6bc7a6bc-6b8a-42d2-a770-e224b7697ea9', '6bc7a6bc-6b8a-42d2-a770-e224b7697ea9', 30, 1800, 19, 19, true, true, true, org_id),
    (mod_pocket, 'Lipedema', '', '8be193a9-0de8-42b5-966a-d52a216de7da', '8be193a9-0de8-42b5-966a-d52a216de7da', 35, 2100, 20, 20, true, true, true, org_id),
    (mod_pocket, 'Medicina capilar', '', 'a284ea86-dcb6-4410-ab11-b0f4fa049b5a', 'a284ea86-dcb6-4410-ab11-b0f4fa049b5a', 30, 1800, 21, 21, true, true, true, org_id),
    (mod_pocket, 'Procedimento capilar na prática', '', 'fc25faa0-1294-4cbb-a74f-5b8ea3ece5cb', 'fc25faa0-1294-4cbb-a74f-5b8ea3ece5cb', 25, 1500, 22, 22, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 3: Posicionamento Digital Estratégico e Intencional
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Posicionamento Digital Estratégico e Intencional', 'Branding, estratégias digitais, oratória, Instagram, TikTok, YouTube e funis de conteúdo.', 3, 3, true, true, false, org_id)
  RETURNING id INTO mod_posicionamento;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_posicionamento, 'Consultoria de imagem e estilo', '', '308b1466-637a-4488-9c1b-005e0e989f2e', '308b1466-637a-4488-9c1b-005e0e989f2e', 40, 2400, 1, 1, true, true, true, org_id),
    (mod_posicionamento, 'Construindo o seu branding', '', '5c969968-93cd-4e67-8e6f-114b3c1efa17', '5c969968-93cd-4e67-8e6f-114b3c1efa17', 35, 2100, 2, 2, true, true, true, org_id),
    (mod_posicionamento, 'Posicionamento Digital', '', '44168dd9-60d4-48a1-991f-c2be1f677e68', '44168dd9-60d4-48a1-991f-c2be1f677e68', 45, 2700, 3, 3, true, true, true, org_id),
    (mod_posicionamento, 'Estratégias Digitais I', '', '9a838b4c-9e03-44f9-a94c-96a1ca1bc9dd', '9a838b4c-9e03-44f9-a94c-96a1ca1bc9dd', 40, 2400, 4, 4, true, true, true, org_id),
    (mod_posicionamento, 'Estratégias Digitais II', '', 'e86dabd4-6197-47b8-af4a-d26d2f63c10d', 'e86dabd4-6197-47b8-af4a-d26d2f63c10d', 40, 2400, 5, 5, true, true, true, org_id),
    (mod_posicionamento, 'Otimize o seu tempo e $ com IA', '', '08e2fb81-ade5-4cca-87fd-0dd05f8d1769', '08e2fb81-ade5-4cca-87fd-0dd05f8d1769', 30, 1800, 6, 6, true, true, true, org_id),
    (mod_posicionamento, 'Criando a sua marca pessoal', '', '47205b12-003f-46bc-8d47-3961b696c717', '47205b12-003f-46bc-8d47-3961b696c717', 35, 2100, 7, 7, true, true, true, org_id),
    (mod_posicionamento, 'Oratória no digital', '', '58e119c3-d99f-4de7-a271-25de8f0f8bf9', '58e119c3-d99f-4de7-a271-25de8f0f8bf9', 30, 1800, 8, 8, true, true, true, org_id),
    (mod_posicionamento, 'Montando um instagram estratégico e intencional', '', 'ba146035-450c-48c8-9c2e-05d97b46f58b', 'ba146035-450c-48c8-9c2e-05d97b46f58b', 45, 2700, 9, 9, true, true, true, org_id),
    (mod_posicionamento, 'Posicionamento Digital Estratégico', '', 'ee27181d-0b54-4b22-ad13-fffd0fa32507', 'ee27181d-0b54-4b22-ad13-fffd0fa32507', 40, 2400, 10, 10, true, true, true, org_id),
    (mod_posicionamento, 'Montando o seu Funil de conteúdo', '', 'f69fe2d8-5f9d-439f-b0aa-f9209f1a9c9d', 'f69fe2d8-5f9d-439f-b0aa-f9209f1a9c9d', 35, 2100, 11, 11, true, true, true, org_id),
    (mod_posicionamento, 'Posicionamento digital pt.1', '', 'b14be558-39a2-4148-8d11-11369dca4e59', 'b14be558-39a2-4148-8d11-11369dca4e59', 40, 2400, 12, 12, true, true, true, org_id),
    (mod_posicionamento, 'Posicionamento digital pt.2', '', '1f3bd9bd-a920-4f7e-8010-7bd0ce8c6753', '1f3bd9bd-a920-4f7e-8010-7bd0ce8c6753', 40, 2400, 13, 13, true, true, true, org_id),
    (mod_posicionamento, 'Tiktok', '', 'c7630e19-94df-4ef6-8bc2-5e2ac34590d0', 'c7630e19-94df-4ef6-8bc2-5e2ac34590d0', 25, 1500, 14, 14, true, true, true, org_id),
    (mod_posicionamento, 'Análise de perfil', '', '6e891a3f-c85a-4050-bbef-61ff9950bd5c', '6e891a3f-c85a-4050-bbef-61ff9950bd5c', 30, 1800, 15, 15, true, true, true, org_id),
    (mod_posicionamento, 'Youtube', '', 'fa318322-1e67-4849-95c0-75e1913117d6', 'fa318322-1e67-4849-95c0-75e1913117d6', 30, 1800, 16, 16, true, true, true, org_id),
    (mod_posicionamento, 'Oratória pro digital', '', '3aba6cf9-9beb-47d2-808c-9cb96f3c1aa5', '3aba6cf9-9beb-47d2-808c-9cb96f3c1aa5', 35, 2100, 17, 17, true, true, true, org_id),
    (mod_posicionamento, 'Funil de conteúdo I', '', '4b7f8e4b-280e-4839-a076-352253b7053b', '4b7f8e4b-280e-4839-a076-352253b7053b', 35, 2100, 18, 18, true, true, true, org_id),
    (mod_posicionamento, 'Funil de conteúdo II', '', '96836f99-5599-450e-b095-d9a0e1f662e3', '96836f99-5599-450e-b095-d9a0e1f662e3', 35, 2100, 19, 19, true, true, true, org_id),
    (mod_posicionamento, 'Funil de manychat', '', '2c7a327a-bb50-4276-988d-4e66a7b1fb49', '2c7a327a-bb50-4276-988d-4e66a7b1fb49', 30, 1800, 20, 20, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 4: Atrai & Encanta
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Atrai & Encanta', 'Gestão de alta performance, IA, encantamento Disney, jornada do paciente e formação de equipe.', 4, 4, true, true, false, org_id)
  RETURNING id INTO mod_atrai;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_atrai, 'Gestão de Alta Performance', '', '41e6783b-546f-48b0-acb1-025d42c19e11', '41e6783b-546f-48b0-acb1-025d42c19e11', 45, 2700, 1, 1, true, true, true, org_id),
    (mod_atrai, 'IA e ferramentas de Gestão', '', 'd163c603-6e2c-47a1-ab8d-cc6ed9877a20', 'd163c603-6e2c-47a1-ab8d-cc6ed9877a20', 35, 2100, 2, 2, true, true, true, org_id),
    (mod_atrai, 'Encantamento Disney', '', '57dc2880-d400-406f-8112-5769cc777887', '57dc2880-d400-406f-8112-5769cc777887', 40, 2400, 3, 3, true, true, true, org_id),
    (mod_atrai, 'Jornada do paciente', '', '4f6d3fb3-37db-491b-9140-112cb50f1bbf', '4f6d3fb3-37db-491b-9140-112cb50f1bbf', 35, 2100, 4, 4, true, true, true, org_id),
    (mod_atrai, 'Criação de Processos', '', 'ee49f321-4428-458b-bcca-7aec4bdb857a', 'ee49f321-4428-458b-bcca-7aec4bdb857a', 30, 1800, 5, 5, true, true, true, org_id),
    (mod_atrai, 'Formação de Equipe', '', '1d80f8c2-395d-42f5-88a1-75ac258a0038', '1d80f8c2-395d-42f5-88a1-75ac258a0038', 35, 2100, 6, 6, true, true, true, org_id),
    (mod_atrai, 'Modelo Disney', '', 'c02c2226-a68c-4549-991c-76e9064e1b07', 'c02c2226-a68c-4549-991c-76e9064e1b07', 40, 2400, 7, 7, true, true, true, org_id),
    (mod_atrai, 'Alta Performance na gestão', '', '29a87d52-4b70-4e1e-9b71-c3e3f43c6f3e', '29a87d52-4b70-4e1e-9b71-c3e3f43c6f3e', 40, 2400, 8, 8, true, true, true, org_id),
    (mod_atrai, 'Usando a IA na gestão', '', 'bda7939f-742c-4ad4-b682-3c336f08612d', 'bda7939f-742c-4ad4-b682-3c336f08612d', 30, 1800, 9, 9, true, true, true, org_id),
    (mod_atrai, 'SWOT e 5W2H', '', '98144ff5-780e-42af-9e22-c47a3f7822e4', '98144ff5-780e-42af-9e22-c47a3f7822e4', 35, 2100, 10, 10, true, true, true, org_id),
    (mod_atrai, 'Como pagar prestadores de serviços', '', '3ea602bb-f212-4ea5-917e-cc727bffc9f5', '3ea602bb-f212-4ea5-917e-cc727bffc9f5', 25, 1500, 11, 11, true, true, true, org_id),
    (mod_atrai, 'Processos', '', 'fc0258f9-2910-4ada-9140-2cbb6a25da0f', 'fc0258f9-2910-4ada-9140-2cbb6a25da0f', 30, 1800, 12, 12, true, true, true, org_id),
    (mod_atrai, 'Jornada do paciente', '', '7c23ba8e-47bb-4bf9-b27a-55f3c3cdd810', '7c23ba8e-47bb-4bf9-b27a-55f3c3cdd810', 35, 2100, 13, 13, true, true, true, org_id),
    (mod_atrai, 'Modelo de encantamento Disney', '', '8b0fc36a-d168-4fd7-9e0b-7c1e9543faf1', '8b0fc36a-d168-4fd7-9e0b-7c1e9543faf1', 40, 2400, 14, 14, true, true, true, org_id),
    (mod_atrai, 'Como estruturar processos', '', '90bc0431-d9f9-40ad-a771-8649714f4e2f', '90bc0431-d9f9-40ad-a771-8649714f4e2f', 30, 1800, 15, 15, true, true, true, org_id),
    (mod_atrai, 'Prompts para IA na gestão', '', 'e01d3cd5-fc31-4235-9c73-11b4cce40260', 'e01d3cd5-fc31-4235-9c73-11b4cce40260', 25, 1500, 16, 16, true, true, true, org_id),
    (mod_atrai, '5W2H & SWOT', '', 'b53c07c9-a509-4c1c-8490-4c11e08f697d', 'b53c07c9-a509-4c1c-8490-4c11e08f697d', 30, 1800, 17, 17, true, true, true, org_id),
    (mod_atrai, 'Formação de Equipe', '', '778c7f30-1682-40bf-ba3a-aae25f80ba1a', '778c7f30-1682-40bf-ba3a-aae25f80ba1a', 35, 2100, 18, 18, true, true, true, org_id),
    (mod_atrai, 'Gestão de Alta Performance', '', '2265ee3d-3e44-4c1f-83b5-61f796eec182', '2265ee3d-3e44-4c1f-83b5-61f796eec182', 40, 2400, 19, 19, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 5: Bônus
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Bônus', 'Conteúdos bônus exclusivos para mentorados.', 5, 5, true, true, false, org_id)
  RETURNING id INTO mod_bonus;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_bonus, 'Aprenda tráfego pago do zero', '', 'c6c3cc69-59c0-4c93-92c1-924a3924807d', 'c6c3cc69-59c0-4c93-92c1-924a3924807d', 60, 3600, 1, 1, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 6: Médicos que Vendem
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Médicos que Vendem', 'Venda consultiva, scripts, protocolos de alto valor, SPIN Selling, objeções e gatilhos mentais.', 6, 6, true, true, false, org_id)
  RETURNING id INTO mod_vendem;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_vendem, 'Venda consultiva', '', '2547e4ff-d4d5-4b09-87e5-4a1b76f3eae3', '2547e4ff-d4d5-4b09-87e5-4a1b76f3eae3', 45, 2700, 1, 1, true, true, true, org_id),
    (mod_vendem, 'Script de venda', '', 'b428cccd-170c-47f8-9c57-95d23a3341f3', 'b428cccd-170c-47f8-9c57-95d23a3341f3', 35, 2100, 2, 2, true, true, true, org_id),
    (mod_vendem, 'Protocolos de alto valor', '', '2485f208-fb24-4430-a3f3-81de20953fa0', '2485f208-fb24-4430-a3f3-81de20953fa0', 40, 2400, 3, 3, true, true, true, org_id),
    (mod_vendem, 'Analisando protocolos de alto Valor I', '', '34e3fb69-264a-470c-809c-85574467ea6f', '34e3fb69-264a-470c-809c-85574467ea6f', 40, 2400, 4, 4, true, true, true, org_id),
    (mod_vendem, 'Scripts de Whatsapp', '', 'c6c3cc69-59c0-4c93-92c1-924a3924807d', 'c6c3cc69-59c0-4c93-92c1-924a3924807d', 30, 1800, 5, 5, true, true, true, org_id),
    (mod_vendem, 'Venda Consultiva II', '', '18c76310-9f8f-4edf-b058-9cee1eb3b208', '18c76310-9f8f-4edf-b058-9cee1eb3b208', 40, 2400, 6, 6, true, true, true, org_id),
    (mod_vendem, 'Montando protocolos de alto valor', '', 'bfc2bd50-ea5e-4709-8037-61b25850b402', 'bfc2bd50-ea5e-4709-8037-61b25850b402', 45, 2700, 7, 7, true, true, true, org_id),
    (mod_vendem, 'SPIN Selling', '', '1bad9ca5-4062-4ebd-ac21-69dc3065f17c', '1bad9ca5-4062-4ebd-ac21-69dc3065f17c', 40, 2400, 8, 8, true, true, true, org_id),
    (mod_vendem, 'Gatilhos Mentais', '', '765b035b-2ef6-4f4b-b6cc-fc4aee8b7150', '765b035b-2ef6-4f4b-b6cc-fc4aee8b7150', 35, 2100, 9, 9, true, true, true, org_id),
    (mod_vendem, 'Objeções', '', 'bc0f0221-6b40-4e39-a5cd-17f9b1d08d18', 'bc0f0221-6b40-4e39-a5cd-17f9b1d08d18', 35, 2100, 10, 10, true, true, true, org_id),
    (mod_vendem, 'Crenças limitantes I', '', '44af3fc6-a4e5-4a2f-a1b5-77244678c2e1', '44af3fc6-a4e5-4a2f-a1b5-77244678c2e1', 30, 1800, 11, 11, true, true, true, org_id),
    (mod_vendem, 'Como fazer dinheiro rápido', '', '8870578c-05c4-4d7b-8ccc-ded59f3c7c91', '8870578c-05c4-4d7b-8ccc-ded59f3c7c91', 35, 2100, 12, 12, true, true, true, org_id),
    (mod_vendem, 'Financiamento de Tratamento e alavancagem patrimonial', '', 'fd14b3bf-ccf7-4db2-aacb-aa47debe6537', 'fd14b3bf-ccf7-4db2-aacb-aa47debe6537', 40, 2400, 13, 13, true, true, true, org_id),
    (mod_vendem, 'CRM - Extraindo o máximo do seu tráfego', '', '989aab8c-d4b5-4d04-b448-0b514b5d9126', '989aab8c-d4b5-4d04-b448-0b514b5d9126', 35, 2100, 14, 14, true, true, true, org_id),
    (mod_vendem, 'Montando protocolos de alto valor', '', 'd57e16cf-85cf-4b63-96cf-491cb39b9769', 'd57e16cf-85cf-4b63-96cf-491cb39b9769', 40, 2400, 15, 15, true, true, true, org_id),
    (mod_vendem, 'Crenças limitantes II', '', '0ef40cd7-48cf-42e0-adf9-fc6b4ba178be', '0ef40cd7-48cf-42e0-adf9-fc6b4ba178be', 30, 1800, 16, 16, true, true, true, org_id),
    (mod_vendem, 'Montando na prática protocolos de alto valor', '', 'e8aeca40-9f92-44b7-a29c-2690c4ba739b', 'e8aeca40-9f92-44b7-a29c-2690c4ba739b', 45, 2700, 17, 17, true, true, true, org_id),
    (mod_vendem, 'SPIN selling II', '', '85e64359-9ac0-431e-9980-c3db33ecd103', '85e64359-9ac0-431e-9980-c3db33ecd103', 40, 2400, 18, 18, true, true, true, org_id),
    (mod_vendem, 'Venda Consultiva II', '', '0f148198-c332-4a86-98a6-a54b3d1c178e', '0f148198-c332-4a86-98a6-a54b3d1c178e', 40, 2400, 19, 19, true, true, true, org_id),
    (mod_vendem, 'Objeções II', '', '87332005-2973-49fc-b127-031ba6a39107', '87332005-2973-49fc-b127-031ba6a39107', 35, 2100, 20, 20, true, true, true, org_id),
    (mod_vendem, 'Gatilhos Mentais II', '', '89588001-ae3e-4d2a-bf79-93684d6d5248', '89588001-ae3e-4d2a-bf79-93684d6d5248', 35, 2100, 21, 21, true, true, true, org_id),
    (mod_vendem, 'Estratégias de negociação', '', '83d45c91-fb2d-41df-bfab-cccd5bd65725', '83d45c91-fb2d-41df-bfab-cccd5bd65725', 40, 2400, 22, 22, true, true, true, org_id);

  -- ==========================================================
  -- MODULE 7: Hotseats
  -- ==========================================================
  INSERT INTO video_modules (title, description, order_index, module_order, is_active, is_published, featured, organization_id)
  VALUES ('Hotseats', 'Hotseats ao vivo com análise de protocolos, funis, tráfego pago e direito médico.', 7, 7, true, true, false, org_id)
  RETURNING id INTO mod_hotseats;

  INSERT INTO video_lessons (module_id, title, description, panda_video_embed_url, video_url, duration_minutes, duration_seconds, order_index, lesson_order, is_active, is_published, is_current, organization_id) VALUES
    (mod_hotseats, 'Hotseat 01', '', 'e485f07e-975f-468c-87c3-74610d20a8f5', 'e485f07e-975f-468c-87c3-74610d20a8f5', 60, 3600, 1, 1, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 02', '', '9ab3f106-0d75-483b-919e-ba3bffded3d2', '9ab3f106-0d75-483b-919e-ba3bffded3d2', 60, 3600, 2, 2, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 03', '', '797d06fe-ceca-4ec5-af02-d4889f351b96', '797d06fe-ceca-4ec5-af02-d4889f351b96', 60, 3600, 3, 3, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 04 - Protocolos I', '', 'a2bb52bb-a2a4-4851-8769-566dd461feb5', 'a2bb52bb-a2a4-4851-8769-566dd461feb5', 60, 3600, 4, 4, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 05 - Protocolos II', '', 'a0ab5cfd-af72-45a2-83f4-c504f773f378', 'a0ab5cfd-af72-45a2-83f4-c504f773f378', 60, 3600, 5, 5, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 06 - Avaliando Funis', '', 'c91a5b66-a44a-4486-8ae6-8dd2063e726a', 'c91a5b66-a44a-4486-8ae6-8dd2063e726a', 60, 3600, 6, 6, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 07 - Avaliando Protocolos', '', 'b0ff9a22-2ac4-4fc3-af34-2c1777eeb570', 'b0ff9a22-2ac4-4fc3-af34-2c1777eeb570', 60, 3600, 7, 7, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 08 - Montagem de Protocolos', '', 'a3ceb2a6-cee2-40d6-9c2a-96deb36c106d', 'a3ceb2a6-cee2-40d6-9c2a-96deb36c106d', 60, 3600, 8, 8, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 09 - Marcos Strider', '', '1b30d985-d7a0-468b-b73b-655d31eee24f', '1b30d985-d7a0-468b-b73b-655d31eee24f', 60, 3600, 9, 9, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 10 - Direito médico', '', '945879e5-88b1-446a-895d-d3281f6a9bdb', '945879e5-88b1-446a-895d-d3281f6a9bdb', 60, 3600, 10, 10, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 11 - Tráfego pago 1', '', 'a69507b8-f9b2-437d-94fb-3a41e52e845b', 'a69507b8-f9b2-437d-94fb-3a41e52e845b', 60, 3600, 11, 11, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 12 - Tráfego pago 2', '', 'eb1f8df4-f013-450b-84ae-5aa8da0a95cf', 'eb1f8df4-f013-450b-84ae-5aa8da0a95cf', 60, 3600, 12, 12, true, true, true, org_id),
    (mod_hotseats, 'Hotseat 13 - Avaliando protocolos', '', 'b9c3afaf-71a1-4db8-b9e5-8078276849e2', 'b9c3afaf-71a1-4db8-b9e5-8078276849e2', 60, 3600, 13, 13, true, true, true, org_id);

  -- ==========================================================
  -- STEP 4: Grant access to ALL mentorados for ALL modules
  -- ==========================================================
  INSERT INTO video_access_control (mentorado_id, module_id, has_access, is_active, organization_id)
  SELECT m.id, vm.id, true, true, org_id
  FROM mentorados m
  CROSS JOIN video_modules vm
  WHERE m.organization_id = org_id
    AND vm.organization_id = org_id
  ON CONFLICT (mentorado_id, module_id) DO UPDATE SET has_access = true, is_active = true;

END $$;

-- ============================================================
-- STEP 5: Set default password for all mentorados
-- Password: medicosderesultado (plain text - auto migra pra bcrypt no primeiro login)
-- ============================================================

UPDATE mentorados
SET password_hash = 'medicosderesultado',
    status_login = 'ativo'
WHERE organization_id = 'a0000000-0000-4000-8000-000000000001';

-- ============================================================
-- VERIFICAÇÃO (rode depois para conferir)
-- ============================================================

-- SELECT 'Módulos' as tipo, COUNT(*) as total FROM video_modules WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
-- UNION ALL
-- SELECT 'Aulas', COUNT(*) FROM video_lessons WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
-- UNION ALL
-- SELECT 'Acessos', COUNT(*) FROM video_access_control WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'
-- UNION ALL
-- SELECT 'Mentorados c/ senha', COUNT(*) FROM mentorados WHERE password_hash IS NOT NULL AND organization_id = 'a0000000-0000-4000-8000-000000000001';
