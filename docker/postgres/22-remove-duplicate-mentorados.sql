-- =====================================================================
-- Migration 22: Remove duplicate mentorados
-- Keeps the oldest/most complete record, deletes the replica
-- All duplicates confirmed to have NO references in dividas, comissoes,
-- checkins, mentorado_scores, or formularios_respostas
-- =====================================================================

BEGIN;

-- =====================================================================
-- DUPLICADOS POR NOME EXATO (8 pares)
-- Criterio: manter o que tem Turma + mais antigo
-- =====================================================================

-- 1. Aguinaldo José Soares Filho
-- MANTER: f0bab600 (Turma 2025.2, criado 2025-10-11, tem CPF, pontuacao=1)
-- APAGAR: 58496931 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = '58496931-ea71-4ac8-81f2-ff3ec0285309';

-- 2. Analu Lessa Sampaio
-- MANTER: 230a9813 (Turma 2025.2, criado 2025-11-03, mais antigo)
-- APAGAR: 31b42e71 (Turma 1, criado 2026-01-15, duplicata)
DELETE FROM mentorados WHERE id = '31b42e71-214e-4a09-888b-3d8b75416183';

-- 3. Bernardo Alencar Wanderley Estanislau da Costa
-- MANTER: 45ddcd40 (Turma 2025.2, criado 2025-09-10)
-- APAGAR: 9e6db2a6 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = '9e6db2a6-e2a4-4064-bec6-4561bf2d86ad';

-- 4. Bruno Angelo Silva
-- MANTER: bee6bab8 (Turma 2025.2, criado 2025-09-10, gmail)
-- APAGAR: 76f12ff6 (sem turma, criado 2026-03-04, hotmail)
DELETE FROM mentorados WHERE id = '76f12ff6-9577-4515-a1c8-d043a785d69d';

-- 5. Carlos Eduardo de Sousa Martins
-- MANTER: b5f72f62 (Turma 2025.2, criado 2025-09-10)
-- APAGAR: 2c9a9856 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = '2c9a9856-06bb-45cb-91cb-0dae318b76a5';

-- 6. LIDIANE CRISTINA DOS SANTOS
-- MANTER: a9f0f205 (Turma 2025.2, criado 2025-09-10, CPF formatado)
-- APAGAR: 14c31a7f (Turma 1, criado 2026-01-14, ALL CAPS)
DELETE FROM mentorados WHERE id = '14c31a7f-8e9c-437c-9786-ea23528949bc';

-- 7. Matheus Gomes Diniz e Silva
-- MANTER: 9aafd7db (Turma 2025.2, criado 2025-11-24, tem tel+CPF)
-- APAGAR: 116cc00f (Turma 1, criado 2026-01-14, sem tel/CPF)
DELETE FROM mentorados WHERE id = '116cc00f-6b77-47c0-90e8-8a0002cdab88';

-- 8. Vanessa da Silva Nogueira
-- MANTER: 7c39c486 (Turma 2025.2, criado 2025-11-01)
-- APAGAR: e86f90e8 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = 'e86f90e8-87bd-4552-8a10-e2327ba689d6';

-- =====================================================================
-- DUPLICADOS POR EMAIL, NOMES LEVEMENTE DIFERENTES (4 pares)
-- Criterio: manter o mais completo/antigo
-- =====================================================================

-- 9. Caroline Dutra / Caroline dutra da costa (caroline.dutrac@hotmail.com)
-- MANTER: 376de7df (Turma 2025.2, criado 2025-09-10, tem telefone, nome completo)
-- APAGAR: 9c4d68a6 (Turma 1, criado 2026-01-14, sem telefone, nome curto)
DELETE FROM mentorados WHERE id = '9c4d68a6-71d4-490d-aca3-0129f4e33117';

-- 10. Roy Ceciliano / Roy charles ceciliano (charles_ceciliano88@hotmail.com)
-- MANTER: 0ad621f7 (Turma 1, criado 2026-02-16)
-- APAGAR: e8023d15 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = 'e8023d15-a214-4c87-90c6-e04dee37e991';

-- 11. Camila Aquino / Camila silva de aquino (kmilaaquino3@gmail.com)
-- MANTER: 4ae16eb2 (Turma 1, criado 2026-01-09, mais antigo)
-- APAGAR: edcf4bd1 (Turma 1, criado 2026-01-15, duplicata 6 dias depois)
DELETE FROM mentorados WHERE id = 'edcf4bd1-9ba6-4972-a59b-118d5eb76ad4';

-- 12. Tatiane Castro / Tatiane Silva de Castro (tati_castro0@hotmail.com)
-- MANTER: 1087d0ef (Turma 2025.2, criado 2025-11-24, tem telefone, nome completo)
-- APAGAR: 9b011699 (Turma 1, criado 2026-01-14, sem telefone, nome curto)
DELETE FROM mentorados WHERE id = '9b011699-b762-47d5-bd24-7dc342ca7628';

-- =====================================================================
-- DUPLICADOS POR TELEFONE/CPF, NOMES PARECIDOS (3 pares)
-- =====================================================================

-- 13. Lorena Torríco Iriarte / Lorena torrico iriarte (mesmo tel + CPF)
-- MANTER: 8c1980ab (Turma 2025.2, criado 2025-09-10)
-- APAGAR: ea5415df (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = 'ea5415df-3f0c-4ca7-a849-b57ed65267ac';

-- 14. Nathália Sales / Nathalia Cavalcante Sales (mesmo tel + CPF)
-- MANTER: 0483d857 (Turma 2025.2, criado 2025-09-10)
-- APAGAR: d5c9bdd5 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = 'd5c9bdd5-4239-448c-a08e-b918f98e71f1';

-- 15. Vitória Torres / Vitória Maria Araújo Torres (mesmo tel)
-- MANTER: ac3bf849 (Turma 1, criado 2026-01-31)
-- APAGAR: e200d509 (sem turma, criado 2026-03-04)
DELETE FROM mentorados WHERE id = 'e200d509-0f76-4568-ba82-f85a79ca349e';

COMMIT;

DO $$ BEGIN RAISE NOTICE 'Migration 22 complete — 15 duplicate mentorados removed'; END $$;
