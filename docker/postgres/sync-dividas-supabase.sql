-- =====================================================================
-- SYNC: dividas from Supabase -> Docker PostgreSQL
-- Generated: 2026-03-06
-- Total: 176 records
-- =====================================================================

-- Add mentorado_nome column if missing (exists in Supabase but not Docker)
ALTER TABLE dividas ADD COLUMN IF NOT EXISTS mentorado_nome TEXT;

-- Begin transaction
BEGIN;

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '5c98b65a-2bce-4c4d-a614-82b1d07747d6', 'João Paulo Guimarães Pena', 65500.0, 0, 65500.0, 'pendente', '2026-02-28', 'supabase_id:1', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:1%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '5c98b65a-2bce-4c4d-a614-82b1d07747d6', 'João Paulo Guimarães Pena', 13800.0, 13800.0, 0, 'pago', '2025-12-30', 'supabase_id:2', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:2%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e98bed4b-61e7-4811-96fa-dcf2406510fd', 'Tailan Fernandes de Almeida', 4149.0, 4149.0, 0, 'pago', '2025-11-30', 'supabase_id:3', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:3%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 1500.0, 0, 'pago', '2026-01-30', 'supabase_id:4', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:4%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 1500.0, 0, 'pago', '2026-02-28', 'supabase_id:5', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-26T11:47:58.994416+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:5%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 0, 1500.0, 'pendente', '2026-03-30', 'supabase_id:6', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:6%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 0, 1500.0, 'pendente', '2026-04-30', 'supabase_id:7', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:7%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 0, 1500.0, 'pendente', '2026-05-30', 'supabase_id:8', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:8%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 1500.0, 0, 'pago', '2025-11-30', 'supabase_id:9', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:9%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '112dd5ab-c661-4e9b-9cf3-947daee5269b', 'Kauê Queiroz de Seabra', 1500.0, 1500.0, 0, 'pago', '2025-12-30', 'supabase_id:10', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:10%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e72254c6-4d95-4faf-8f58-a8a75efbf31c', 'Marcus Da Silva Sardinha', 10000.0, 10000.0, 0, 'pago', '2025-12-03', 'supabase_id:11', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:11%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '230a9813-d631-45a4-a3a1-cb0d25c6b496', 'Analu Lessa Sampaio', 29000.0, 29000.0, 0, 'pago', '2026-02-20', 'supabase_id:12', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:54:26.329461+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:12%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '0483d857-8c93-4771-8f1d-0542cb4db571', 'Nathália Sales', 20000.0, 20000.0, 0, 'pago', '2026-01-09', 'supabase_id:13', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:13%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'bde9ce00-b8eb-4f02-872d-19c3c11de68b', 'Julia Ranielly de Oliveira Rios', 10000.0, 10000.0, 0, 'pago', '2025-10-30', 'supabase_id:14', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:14%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '85d2b2a9-8cd6-4417-ad91-8847a1504189', 'Pedro Paulo Assunção da Silva', 10000.0, 10000.0, 0, 'pago', '2025-11-30', 'supabase_id:15', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:15%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1cd7217c-f4e2-4e1a-b4d3-9e82fd87feb3', 'Sara Campos de Oliveira ', 27666.0, 27666.0, 0, 'pago', '2025-11-20', 'supabase_id:16', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:16%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1d5d8545-3f54-44fc-aea4-e647720ae062', 'Wendell Felipe Garcia ', 10000.0, 10000.0, 0, 'pago', '2025-12-20', 'supabase_id:17', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:17%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '879fb566-2117-4113-8e02-0e44fa8ca049', 'Lucas Vinicius Dias da Silva', 16714.0, 16714.0, 0, 'pago', '2025-11-30', 'supabase_id:18', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:18%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f895ba7f-1e64-4391-8b56-3ce21314cc59', 'Natalia Gomes Alves Tomaz', 12500.0, 0, 12500.0, 'pendente', '2026-02-09', 'supabase_id:19', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:19%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f895ba7f-1e64-4391-8b56-3ce21314cc59', 'Natalia Gomes Alves Tomaz', 12500.0, 12500.0, 0, 'pago', '2025-12-09', 'supabase_id:20', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:20%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'ae157ae7-2005-4f41-99d2-2f1a5bcf6da3', 'Renata Santos Teixeira', 7000.0, 7000.0, 0, 'pago', '2026-01-05', 'supabase_id:21', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:21%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'ae157ae7-2005-4f41-99d2-2f1a5bcf6da3', 'Renata Santos Teixeira', 7000.0, 7000.0, 0, 'pago', '2026-02-05', 'supabase_id:22', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:22%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'ae157ae7-2005-4f41-99d2-2f1a5bcf6da3', 'Renata Santos Teixeira', 7000.0, 7000.0, 0, 'pago', '2025-12-05', 'supabase_id:23', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:23%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b1b2d19a-7cc0-470d-84f4-df9cb613a4ed', 'Beatriz Vieira Gurgel ', 15000.0, 15000.0, 0, 'pago', '2025-11-30', 'supabase_id:24', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:24%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b1b2d19a-7cc0-470d-84f4-df9cb613a4ed', 'Beatriz Vieira Gurgel ', 10000.0, 10000.0, 0, 'pago', '2026-01-15', 'supabase_id:25', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:25%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '03bc521c-0ad9-40fc-8fa8-c4d74d7e2ec3', ' Abelardo Pires Maia Neto', 15000.0, 15000.0, 0, 'pago', '2025-11-10', 'supabase_id:26', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:26%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '7c39c486-f1a4-4847-b8dc-8560c9fc560c', 'Vanessa da Silva Nogueira ', 20000.0, 20000.0, 0, 'pago', '2025-12-15', 'supabase_id:27', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:27%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'João Paulo', 45000.0, 0, 45000.0, 'pendente', '2025-10-15', 'supabase_id:28', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:28%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Fernanda Silveira', 4000.0, 0, 4000.0, 'pendente', '2025-08-15', 'supabase_id:29', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:29%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Marcelo', 2500.0, 0, 2500.0, 'pendente', '2025-09-15', 'supabase_id:30', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:30%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Marcelo', 2500.0, 0, 2500.0, 'pendente', '2025-10-15', 'supabase_id:31', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:31%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Marcus', 20000.0, 0, 20000.0, 'pendente', '2025-10-15', 'supabase_id:32', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:32%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Marcus', 20000.0, 0, 20000.0, 'pendente', '2025-11-15', 'supabase_id:33', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:33%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Marcus', 10000.0, 0, 10000.0, 'pendente', '2025-12-15', 'supabase_id:34', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:34%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-01-15', 'supabase_id:35', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:35%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-02-15', 'supabase_id:36', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:36%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-03-15', 'supabase_id:37', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:37%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-04-15', 'supabase_id:38', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:38%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-10-15', 'supabase_id:39', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:39%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-11-15', 'supabase_id:40', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:40%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Kauê', 1500.0, 0, 1500.0, 'pendente', '2025-12-15', 'supabase_id:41', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:41%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Pedro', 5000.0, 0, 5000.0, 'pendente', '2025-10-15', 'supabase_id:42', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:42%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), NULL, 'Pedro', 10000.0, 0, 10000.0, 'pendente', '2025-11-15', 'supabase_id:43', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-10T14:47:07.649801+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:43%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1a75e5f6-f97a-4b58-8f87-cdedcbc4e05c', 'Daniela Alencar Silva', 23976.0, 23976.0, 0, 'pago', '2025-12-20', 'supabase_id:47', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-14T16:43:32.201475+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:47%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'da70b706-059e-4d79-95bb-e2a401007249', 'Maria Vitoria Coutinho', 10000.0, 10000.0, 0, 'pago', '2025-11-18', 'supabase_id:48', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-17T17:41:53.32495+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:48%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f950209f-8a72-4cfc-8e9b-52dcff070fe7', 'Ruan Mathias Sousa Dias', 5000.0, 5000.0, 0, 'pago', '2025-12-15', 'supabase_id:49', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-19T19:58:08.661803+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:49%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1ee0145d-fb37-4aef-a808-ce6908415257', 'Márcia de Britto da Rocha', 42952.0, 42952.0, 0, 'pago', '2025-11-30', 'supabase_id:50', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-21T18:54:24.460154+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:50%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e98bed4b-61e7-4811-96fa-dcf2406510fd', 'Tailan Fernandes de Almeida', 2149.0, 2149.0, 0, 'pago', '2025-12-20', 'supabase_id:51', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-26T16:23:24.627373+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:51%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '49fa1e2c-5867-490a-91e4-14ccdaf66fa5', 'Erika Thais', 22000.0, 22000.0, 0, 'pago', '2025-12-05', 'supabase_id:52', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-26T19:37:10.456948+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:52%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1f8bd154-da8f-4d62-8f04-8c5838c1b48f', 'Isabela Chaves', 10000.0, 10000.0, 0, 'pago', '2025-12-28', 'supabase_id:54', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-11-28T19:27:43.910972+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:54%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '64f2bac1-c9e3-43b6-9bb9-ede417190684', 'Saulo Souza Silva', 25000.0, 25000.0, 0, 'pago', '2025-12-05', 'supabase_id:55', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-01T18:22:54.781693+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:55%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '64f2bac1-c9e3-43b6-9bb9-ede417190684', 'Saulo Souza Silva', 3500.0, 3500.0, 0, 'pago', '2026-01-05', 'supabase_id:56', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-01T18:25:03.951794+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:56%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '64f2bac1-c9e3-43b6-9bb9-ede417190684', 'Saulo Souza Silva', 3500.0, 3500.0, 0, 'pago', '2026-02-28', 'supabase_id:57', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-01T18:25:23.095134+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:57%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '64f2bac1-c9e3-43b6-9bb9-ede417190684', 'Saulo Souza Silva', 3500.0, 0, 3500.0, 'pendente', '2026-03-31', 'supabase_id:58', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-01T18:25:48.181389+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:58%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '64f2bac1-c9e3-43b6-9bb9-ede417190684', 'Saulo Souza Silva', 1500.0, 0, 1500.0, 'pendente', '2026-04-30', 'supabase_id:59', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-01T18:26:10.537069+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:59%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '49fa1e2c-5867-490a-91e4-14ccdaf66fa5', 'Erika Thais', 17000.0, 17000.0, 0, 'pago', '2025-12-05', 'supabase_id:61', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-04T18:36:12.795944+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:61%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '7c39c486-f1a4-4847-b8dc-8560c9fc560c', 'Vanessa da Silva Nogueira ', 8000.0, 8000.0, 0, 'pago', '2026-01-20', 'supabase_id:62', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-11T18:58:18.159073+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:62%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e938761-5388-4f4c-a8fb-01b6de8dd033', 'Magno cruz', 25000.0, 25000.0, 0, 'pago', '2025-12-19', 'supabase_id:63', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-18T16:04:17.133779+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:63%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '298b408b-72eb-4ba1-b70b-19ea29bfdc6c', 'Paulo Vitor', 10000.0, 10000.0, 0, 'pago', '2026-01-17', 'supabase_id:64', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-18T16:04:46.30526+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:64%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b2ba96f8-b0f0-4d93-b72e-b3d9e570cf4b', 'Kamilla Moreira', 43952.0, 43952.0, 0, 'pago', '2026-01-25', 'supabase_id:65', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-22T16:18:53.641151+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:65%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f07969b1-4aa5-42bd-adb6-5f4813e2a866', 'Luiz Augusto ', 10000.0, 10000.0, 0, 'pago', '2026-02-10', 'supabase_id:66', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-28T13:08:17.271864+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:66%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f07969b1-4aa5-42bd-adb6-5f4813e2a866', 'Luiz Augusto ', 5000.0, 0, 5000.0, 'pendente', '2026-03-10', 'supabase_id:67', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2025-12-28T13:08:38.965488+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:67%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f8fbacd7-020c-4275-83a3-8c539e34ebde', 'Guilherme Cezar Soares ', 800.0, 0, 800.0, 'pendente', '2024-12-15', 'supabase_id:87', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T18:26:41.672691+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:87%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c97fae5f-20e2-4c13-8dde-4ace778be2cd', 'Emerson Barbosa', 900.0, 0, 900.0, 'pendente', '2024-12-15', 'supabase_id:97', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T18:26:42.79873+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:97%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '001a635f-e66e-4b4c-a1e5-9d21d2f5790e', 'Ana Luisa Brito', 350.0, 0, 350.0, 'atrasado', '2025-12-10', 'supabase_id:99 | Mensalidade de dezembro - Em atraso', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:04:40.842357+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:99%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '001a635f-e66e-4b4c-a1e5-9d21d2f5790e', 'Ana Luisa Brito', 5000.0, 5000.0, 0, 'pago', '2026-01-12', 'supabase_id:102', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:13:38.803735+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:102%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '001a635f-e66e-4b4c-a1e5-9d21d2f5790e', 'Ana Luisa Brito', 7500.0, 0, 7500.0, 'pendente', '2026-04-08', 'supabase_id:103', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:14:08.846398+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:103%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '001a635f-e66e-4b4c-a1e5-9d21d2f5790e', 'Ana Luisa Brito', 7500.0, 0, 7500.0, 'pendente', '2026-03-08', 'supabase_id:104', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:14:32.874104+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:104%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '14cebf2a-564c-4efa-a0d0-dbbfadc08467', 'Nathalia Naves ', 10000.0, 10000.0, 0, 'pago', '2026-02-08', 'supabase_id:105', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:22:06.065567+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:105%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '14cebf2a-564c-4efa-a0d0-dbbfadc08467', 'Nathalia Naves ', 10000.0, 0, 10000.0, 'pendente', '2026-03-08', 'supabase_id:106', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:22:25.266744+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:106%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '14cebf2a-564c-4efa-a0d0-dbbfadc08467', 'Nathalia Naves ', 10000.0, 0, 10000.0, 'pendente', '2026-04-08', 'supabase_id:107', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:22:46.880966+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:107%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '14cebf2a-564c-4efa-a0d0-dbbfadc08467', 'Nathalia Naves ', 15000.0, 0, 15000.0, 'pendente', '2026-05-08', 'supabase_id:108', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T20:23:07.911135+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:108%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '76426a3c-7385-4719-8c7f-362ea15014f6', 'Bruna Menin', 30000.0, 30000.0, 0, 'pago', '2026-01-22', 'supabase_id:109', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T21:35:58.969758+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:109%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '76426a3c-7385-4719-8c7f-362ea15014f6', 'Bruna Menin', 25000.0, 25000.0, 0, 'pago', '2026-02-22', 'supabase_id:110', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-08T21:37:22.078422+00:00', '2026-02-25T17:55:20.097439+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:110%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e8bfc119-9913-407c-a7dc-4596cf78afeb', 'Lucas Diminic', 48000.0, 48000.0, 0, 'pago', '2026-01-12', 'supabase_id:112', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:22:07.478401+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:112%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 8000.0, 0, 'pago', '2026-02-09', 'supabase_id:113', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:23:31.851774+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:113%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-03-09', 'supabase_id:114', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:23:58.267292+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:114%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-04-09', 'supabase_id:115', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:24:14.003264+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:115%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-05-09', 'supabase_id:116', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:24:40.593607+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:116%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-07-09', 'supabase_id:117', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:25:05.278334+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:117%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-06-09', 'supabase_id:118', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:26:01.741836+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:118%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-08-09', 'supabase_id:119', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:26:18.316206+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:119%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-09-09', 'supabase_id:120', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:26:47.693214+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:120%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4ae16eb2-e34d-4557-8af0-29fe32ede6c4', 'Camila Aquino', 8000.0, 0, 8000.0, 'pendente', '2026-10-09', 'supabase_id:122', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-09T22:27:34.778344+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:122%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '0999d92f-0859-490c-b904-ab36d3ecb4ba', 'Jefferson Pontes', 20000.0, 20000.0, 0, 'pago', '2026-01-10', 'supabase_id:123', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-10T19:46:24.190951+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:123%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '0999d92f-0859-490c-b904-ab36d3ecb4ba', 'Jefferson Pontes', 20000.0, 0, 20000.0, 'pendente', '2026-02-28', 'supabase_id:124', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-10T19:46:43.061894+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:124%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '0999d92f-0859-490c-b904-ab36d3ecb4ba', 'Jefferson Pontes', 30952.0, 0, 30952.0, 'pendente', '2026-03-31', 'supabase_id:126', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-10T19:55:16.349559+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:126%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1cba089e-0087-47aa-b899-ef8116464afc', 'Marianna Queiroz', 30000.0, 30000.0, 0, 'pago', '2026-01-14', 'supabase_id:128', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-14T19:45:58.207662+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:128%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '1cba089e-0087-47aa-b899-ef8116464afc', 'Marianna Queiroz', 22000.0, 22000.0, 0, 'pago', '2026-02-14', 'supabase_id:129', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-14T19:46:24.410113+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:129%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e2266a40-1d1b-49d1-9642-b75c1d58dcba', 'Rebecca Caroline', 23984.0, 23984.0, 0, 'pago', '2026-01-17', 'supabase_id:131', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-16T04:26:37.381234+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:131%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e2266a40-1d1b-49d1-9642-b75c1d58dcba', 'Rebecca Caroline', 11992.0, 11992.0, 0, 'pago', '2026-02-15', 'supabase_id:132', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-16T04:27:20.618857+00:00', '2026-02-25T17:52:01.657629+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:132%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'e2266a40-1d1b-49d1-9642-b75c1d58dcba', 'Rebecca Caroline', 11992.0, 0, 11992.0, 'pendente', '2026-03-15', 'supabase_id:133', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-16T04:27:39.057565+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:133%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b1b2d19a-7cc0-470d-84f4-df9cb613a4ed', 'Beatriz Vieira Gurgel', 4000.0, 4000.0, 0, 'pago', '2026-02-15', 'supabase_id:134', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-16T17:47:02.86831+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:134%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '96501e0a-f516-48fc-8f17-3b92510e10da', 'Franklim Gonçalves', 55000.0, 55000.0, 0, 'pago', '2026-01-27', 'supabase_id:135', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T15:14:41.222064+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:135%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8e76f738-8b25-46d4-a613-6d6f66c92096', 'Marcela Marques', 8000.0, 8000.0, 0, 'pago', '2026-01-31', 'supabase_id:137', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T23:51:30.276043+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:137%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8e76f738-8b25-46d4-a613-6d6f66c92096', 'Marcela Marques', 10000.0, 10000.0, 0, 'pago', '2026-01-21', 'supabase_id:138', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T23:53:16.70518+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:138%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8e76f738-8b25-46d4-a613-6d6f66c92096', 'Marcela Marques', 12000.0, 0, 12000.0, 'pendente', '2026-02-28', 'supabase_id:139', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T23:55:40.744261+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:139%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8e76f738-8b25-46d4-a613-6d6f66c92096', 'Marcela Marques', 12000.0, 0, 12000.0, 'pendente', '2026-03-30', 'supabase_id:140', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T23:56:01.512466+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:140%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8e76f738-8b25-46d4-a613-6d6f66c92096', 'Marcela Marques', 10000.0, 0, 10000.0, 'pendente', '2026-04-30', 'supabase_id:141', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-20T23:56:19.669599+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:141%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b193eb66-88c0-4de3-86ea-70da55556e10', 'Nayara Zahr', 45000.0, 45000.0, 0, 'pago', '2026-01-21', 'supabase_id:142', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-21T01:17:14.61761+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:142%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '7776df2d-41b1-49fb-9913-167e702ed5fd', 'Irlani Santos', 33000.0, 33000.0, 0, 'pago', '2026-01-22', 'supabase_id:143', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-22T14:47:01.146952+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:143%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '7776df2d-41b1-49fb-9913-167e702ed5fd', 'Irlani Santos', 28000.0, 28000.0, 0, 'pago', '2026-01-22', 'supabase_id:144', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-22T14:48:46.468142+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:144%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '76426a3c-7385-4719-8c7f-362ea15014f6', 'Bruna Menin', 20000.0, 20000.0, 0, 'pago', '2026-01-22', 'supabase_id:145', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-22T15:51:36.04298+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:145%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '33be0dc9-ba9a-4a1f-b307-e53723134fa7', 'Cristiane Barroso', 16000.0, 0, 16000.0, 'pendente', '2026-02-28', 'supabase_id:146', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-22T20:25:44.668402+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:146%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '33be0dc9-ba9a-4a1f-b307-e53723134fa7', 'Cristiane Barroso', 16000.0, 0, 16000.0, 'pendente', '2026-03-28', 'supabase_id:147', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-22T20:26:40.806858+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:147%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b2ba96f8-b0f0-4d93-b72e-b3d9e570cf4b', 'Kamilla Moreira', 40000.0, 0, 40000.0, 'pendente', '2026-02-28', 'supabase_id:148', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-23T20:39:13.490023+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:148%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 6000.0, 0, 'pago', '2026-02-25', 'supabase_id:149', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:19:36.511965+00:00', '2026-02-25T23:46:10.483544+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:149%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-03-25', 'supabase_id:150', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:20:01.941565+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:150%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-04-25', 'supabase_id:151', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:20:36.753548+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:151%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-05-25', 'supabase_id:152', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:21:09.061425+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:152%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-06-25', 'supabase_id:153', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:21:31.358238+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:153%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-07-25', 'supabase_id:154', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:22:10.303891+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:154%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-08-25', 'supabase_id:155', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:22:38.363988+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:155%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-09-25', 'supabase_id:156', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:23:07.486982+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:156%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-10-25', 'supabase_id:157', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:23:34.003339+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:157%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c4459154-fd3b-4cb6-b2fc-4cb335acca7f', 'Nathalia Oliveira', 6000.0, 0, 6000.0, 'pendente', '2026-11-25', 'supabase_id:158', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T04:24:18.168469+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:158%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '33ce72f8-295b-4634-8743-b9198740eda6', 'Heitor Matos', 30000.0, 30000.0, 0, 'pago', '2026-02-06', 'supabase_id:159', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T18:02:46.603943+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:159%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '4a786ec7-e2b9-4bc1-9d62-01d9d30d62fd', 'Leonardo Lima', 21952.0, 0, 21952.0, 'pendente', '2026-03-28', 'supabase_id:160', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T20:40:33.476698+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:160%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f65ccc1d-f71f-4fd0-be06-aa6c841e050e', 'Felipe Augusto', 15000.0, 15000.0, 0, 'pago', '2026-01-29', 'supabase_id:161', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-26T22:10:20.565599+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:161%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '380f3c14-0817-4590-bd82-3cbec18c1d09', 'Victor Venâncio', 30000.0, 30000.0, 0, 'pago', '2026-01-28', 'supabase_id:162', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-27T20:32:55.993173+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:162%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '380f3c14-0817-4590-bd82-3cbec18c1d09', 'Victor Venâncio', 20000.0, 0, 20000.0, 'pendente', '2026-02-28', 'supabase_id:163', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-27T20:33:27.087309+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:163%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '380f3c14-0817-4590-bd82-3cbec18c1d09', 'Victor Venâncio', 10000.0, 10000.0, 0, 'pago', '2026-01-29', 'supabase_id:164', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T18:45:56.760106+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:164%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 15000.0, 15000.0, 0, 'pago', '2026-02-05', 'supabase_id:165', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:24:20.245724+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:165%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 7400.0, 0, 7400.0, 'pendente', '2026-03-05', 'supabase_id:166', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:24:44.293332+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:166%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 7400.0, 0, 7400.0, 'pendente', '2026-04-05', 'supabase_id:167', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:25:40.590541+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:167%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 7400.0, 0, 7400.0, 'pendente', '2026-05-05', 'supabase_id:168', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:26:06.152139+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:168%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 7400.0, 0, 7400.0, 'pendente', '2026-06-05', 'supabase_id:169', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:26:25.088848+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:169%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '3dd8240e-d1cc-4e0a-b206-3d5353d10e7b', 'Bianca Ambrosim', 7400.0, 0, 7400.0, 'pendente', '2026-07-05', 'supabase_id:170', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-28T23:26:42.94191+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:170%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'bc85f700-f2c7-4ba7-b0da-ccd3abde7012', 'Paulo Fernandes', 28400.0, 28400.0, 0, 'pago', '2026-02-16', 'supabase_id:171', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-29T17:05:06.948754+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:171%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2996557d-0cf2-4289-a99e-810a3c772887', 'Lethicia Cordeiro', 13377.0, 0, 13377.0, 'pendente', '2026-02-28', 'supabase_id:172', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-29T17:07:40.39037+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:172%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2996557d-0cf2-4289-a99e-810a3c772887', 'Lethicia Cordeiro', 13377.0, 0, 13377.0, 'pendente', '2026-03-29', 'supabase_id:173', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-29T17:09:30.085094+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:173%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '8fad3b81-b15c-4c4c-9bd8-ca4a7e166e61', 'Renan Vieira', 50000.0, 50000.0, 0, 'pago', '2026-01-30', 'supabase_id:187', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-01-30T17:23:31.525082+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:187%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '5bce31d4-4698-49bf-8728-28a3e82b8584', 'Clara Marquelli', 60000.0, 60000.0, 0, 'pago', '2026-02-06', 'supabase_id:192', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-04T13:05:43.912182+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:192%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f6e48d2b-656e-4f18-bf6c-c423faf703c2', 'Daniel Massini', 13000.0, 0, 13000.0, 'pendente', '2026-02-28', 'supabase_id:193', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-04T13:08:15.156034+00:00', '2026-02-26T17:04:15.08923+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:193%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b451fc5d-e0e3-48d5-85ee-3947fa3cac49', 'Felipe Carvalho', 6000.0, 0, 6000.0, 'pendente', '2026-02-28', 'supabase_id:194', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-04T13:09:41.259285+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:194%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'b451fc5d-e0e3-48d5-85ee-3947fa3cac49', 'Felipe Carvalho', 11400.0, 0, 11400.0, 'pendente', '2026-03-31', 'supabase_id:195', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-04T13:10:48.157324+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:195%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'ce0f6444-7b67-4c2c-9a3f-52218afc83a4', 'Paulo Almendra', 48400.0, 0, 48400.0, 'pendente', '2026-02-28', 'supabase_id:196', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-04T13:13:27.89531+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:196%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '5bce31d4-4698-49bf-8728-28a3e82b8584', 'Clara Marquelli', 6952.0, 0, 6952.0, 'pendente', '2026-03-06', 'supabase_id:197', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-06T23:22:39.233914+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:197%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'dce6ad62-37aa-4f52-8dc9-aab6bedc1dcc', 'Bruna Marsicano', 20000.0, 0, 20000.0, 'pendente', '2026-03-12', 'supabase_id:198', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-07T01:38:26.946679+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:198%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c97fae5f-20e2-4c13-8dde-4ace778be2cd', 'Emerson Barbosa', 100.0, 100.0, 0, 'pago', '2026-02-10', 'supabase_id:199', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-09T10:09:11.330022+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:199%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c97fae5f-20e2-4c13-8dde-4ace778be2cd', 'Emerson Barbosa', 1.0, 1.0, 0, 'pago', '2026-02-09', 'supabase_id:200', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-09T10:17:46.157401+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:200%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c97fae5f-20e2-4c13-8dde-4ace778be2cd', 'Emerson Barbosa', 1.0, 0, 1.0, 'pendente', '2003-02-09', 'supabase_id:201', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-09T10:30:43.916228+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:201%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'c97fae5f-20e2-4c13-8dde-4ace778be2cd', 'Emerson Barbosa', 1.0, 1.0, 0, 'pago', '2026-02-09', 'supabase_id:202', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-09T10:31:03.071083+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:202%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f07969b1-4aa5-42bd-adb6-5f4813e2a866', 'Luiz Augusto ', 5000.0, 0, 5000.0, 'pendente', '2026-04-10', 'supabase_id:203', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-10T16:26:55.688148+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:203%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f07969b1-4aa5-42bd-adb6-5f4813e2a866', 'Luiz Augusto ', 5000.0, 0, 5000.0, 'pendente', '2026-05-10', 'supabase_id:204', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-10T16:27:12.732896+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:204%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-03-30', 'supabase_id:205', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:19:35.052639+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:205%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-04-30', 'supabase_id:206', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:20:04.149585+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:206%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-05-30', 'supabase_id:207', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:20:35.524618+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:207%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-06-30', 'supabase_id:208', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:22:36.518383+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:208%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-07-30', 'supabase_id:209', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:23:06.089478+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:209%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-08-30', 'supabase_id:210', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:23:42.394418+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:210%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-09-30', 'supabase_id:211', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:24:08.4952+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:211%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-10-30', 'supabase_id:212', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:24:37.754099+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:212%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-11-30', 'supabase_id:213', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:25:02.223363+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:213%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2026-12-30', 'supabase_id:214', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-11T00:25:26.367632+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:214%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'd3e7909f-b283-4841-b1eb-1da3183d06ee', 'Raquel Pontes', 20000.0, 0, 20000.0, 'pendente', '2026-05-31', 'supabase_id:227', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-12T22:17:06.653708+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:227%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'dce6ad62-37aa-4f52-8dc9-aab6bedc1dcc', 'Bruna Marsicano', 20000.0, 0, 20000.0, 'pendente', '2026-04-12', 'supabase_id:228', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-12T23:46:48.099346+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:228%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '5a904dc0-8fd4-4326-b659-681c023ebd97', 'Pedro Alessi Ribeiro', 10000.0, 10000.0, 0, 'pago', '2026-02-13', 'supabase_id:229', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-13T01:29:40.79135+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:229%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '46ca595e-6aa6-402e-abaa-5728c3bcb724', 'Dyrla Macêdo', 3500.0, 0, 3500.0, 'pendente', '2026-03-30', 'supabase_id:233', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-13T19:53:05.502137+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:233%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '46ca595e-6aa6-402e-abaa-5728c3bcb724', 'Dyrla Macêdo', 3500.0, 0, 3500.0, 'pendente', '2026-04-30', 'supabase_id:234', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-13T19:53:25.012826+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:234%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f693a2ce-73a5-46d8-b26e-ce5bc0dd98f3', 'Celia faria tavares Gontijo', 5000.0, 0, 5000.0, 'pendente', '2026-03-30', 'supabase_id:235', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-14T00:44:18.203537+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:235%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), 'f693a2ce-73a5-46d8-b26e-ce5bc0dd98f3', 'Celia faria tavares Gontijo', 5000.0, 0, 5000.0, 'pendente', '2026-04-30', 'supabase_id:236', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-14T00:44:35.382621+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:236%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '0ad621f7-aef7-4c53-b297-027af0706f78', 'Roy Ceciliano', 6000.0, 0, 6000.0, 'pendente', '2026-02-25', 'supabase_id:237', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-16T20:23:16.181235+00:00', '2026-02-26T12:57:02.659083+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:237%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2027-01-30', 'supabase_id:240', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T02:38:10.35464+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:240%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '27ad5393-5964-479f-b6cd-e202c0105802', 'Maria Eduarda Guimarães', 5528.0, 0, 5528.0, 'pendente', '2027-02-28', 'supabase_id:241', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T02:39:33.141489+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:241%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-03-18', 'supabase_id:242', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:43:37.330179+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:242%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-04-18', 'supabase_id:243', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:45:35.282099+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:243%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 5700.0, 0, 5700.0, 'pendente', '2026-05-18', 'supabase_id:244', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:46:08.091234+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:244%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 500.0, 0, 500.0, 'pendente', '2026-05-18', 'supabase_id:245', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:46:48.684086+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:245%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-06-18', 'supabase_id:246', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:47:31.10762+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:246%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-07-18', 'supabase_id:247', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:48:05.841512+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:247%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-08-18', 'supabase_id:248', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:50:04.383038+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:248%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-09-18', 'supabase_id:249', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:51:29.427586+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:249%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-10-18', 'supabase_id:250', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:52:44.080904+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:250%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-11-18', 'supabase_id:251', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:53:33.700075+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:251%');

INSERT INTO dividas (id, mentorado_id, mentorado_nome, valor_total, valor_pago, valor_restante, status, data_vencimento, observacoes, organization_id, created_at, updated_at)
SELECT gen_random_uuid(), '2e321d27-b472-408b-a9db-848e91334080', 'Jacy Martins Junior', 6200.0, 0, 6200.0, 'pendente', '2026-12-18', 'supabase_id:252', '9c8c0033-15ea-4e33-a55f-28d81a19693b', '2026-02-18T21:54:00.558621+00:00', '2026-02-25T17:43:56.759733+00:00'
WHERE NOT EXISTS (SELECT 1 FROM dividas WHERE observacoes LIKE '%supabase_id:252%');

COMMIT;

-- Summary query
SELECT status, COUNT(*), SUM(valor_total) as total FROM dividas GROUP BY status;