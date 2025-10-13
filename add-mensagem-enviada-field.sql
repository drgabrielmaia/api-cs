-- Adicionar campo para controlar se mensagem de lembrete foi enviada
-- Sistema simples: true/false no próprio evento

ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS mensagem_enviada BOOLEAN DEFAULT false;

-- Comentário para documentar
COMMENT ON COLUMN calendar_events.mensagem_enviada IS 'Indica se mensagem de lembrete (30min antes) já foi enviada via WhatsApp';

-- Índice para performance nas consultas do job
CREATE INDEX IF NOT EXISTS idx_calendar_events_mensagem_enviada
ON calendar_events(mensagem_enviada, start_datetime);

-- Para eventos existentes que podem ter recebido mensagem, manter como false
-- (será atualizado automaticamente quando a API enviar próximas mensagens)

-- Verificar se funcionou
-- SELECT id, title, start_datetime, mensagem_enviada FROM calendar_events LIMIT 5;