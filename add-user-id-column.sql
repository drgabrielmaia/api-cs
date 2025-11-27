-- Adicionar coluna user_id na tabela auto_messages
ALTER TABLE auto_messages
ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';

-- Atualizar mensagens existentes para ter user_id default
UPDATE auto_messages
SET user_id = 'default'
WHERE user_id IS NULL;