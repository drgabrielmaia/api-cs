-- Adicionar suporte a fotos nas mensagens automáticas
ALTER TABLE auto_messages
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS photo_caption TEXT;