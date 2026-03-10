-- Migration 30: Add missing columns to comissoes table
-- The frontend references columns that don't exist in the base schema

ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS valor_venda DECIMAL(10,2);
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS valor_comissao DECIMAL(10,2);
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS percentual_comissao DECIMAL(5,2);
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS data_venda DATE;
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'pendente';
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(50);
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS recipient_pix_key TEXT;
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS recipient_bank TEXT;

-- Set valor_comissao from valor for existing records that have valor but not valor_comissao
UPDATE comissoes SET valor_comissao = valor WHERE valor_comissao IS NULL AND valor IS NOT NULL;

-- Set status_pagamento from status for existing records
UPDATE comissoes SET status_pagamento = status WHERE status_pagamento = 'pendente' AND status IS NOT NULL AND status != 'pendente';

-- Set all percentual_comissao to 0 (commissions are fixed amounts, not percentages)
UPDATE comissoes SET percentual_comissao = 0;
