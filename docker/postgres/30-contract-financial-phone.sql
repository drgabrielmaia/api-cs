-- 30-contract-financial-phone.sql
-- Add financial_phone to contracts for per-contract override
-- Also add financeiro_phone to organizations if not exists

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS financeiro_phone TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS financial_phone TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS financial_customized_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS financial_sent_to_recipient_at TIMESTAMPTZ;
