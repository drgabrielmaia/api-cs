-- Criar tabela para logs de notificações enviadas
-- Evita mensagens duplicadas mesmo com reinicializações do servidor

CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL DEFAULT '30min',
    event_date DATE NOT NULL,
    recipient_phone VARCHAR(20),
    recipient_name VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notification_logs_event ON notification_logs(event_id, notification_type, event_date);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at);

-- Constraint para evitar duplicatas exatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_logs_unique
ON notification_logs(event_id, notification_type, event_date, recipient_phone);

-- Comentários
COMMENT ON TABLE notification_logs IS 'Logs de notificações WhatsApp enviadas para evitar duplicatas';
COMMENT ON COLUMN notification_logs.event_id IS 'ID do evento do calendário';
COMMENT ON COLUMN notification_logs.notification_type IS 'Tipo: 30min, 30min_mentorado, 30min_admin, daily_summary';
COMMENT ON COLUMN notification_logs.event_date IS 'Data do evento (YYYY-MM-DD)';
COMMENT ON COLUMN notification_logs.recipient_phone IS 'Telefone que recebeu a mensagem';
COMMENT ON COLUMN notification_logs.recipient_name IS 'Nome do destinatário';
COMMENT ON COLUMN notification_logs.sent_at IS 'Timestamp quando foi enviado';

-- Exemplo de uso:
-- INSERT INTO notification_logs (event_id, notification_type, event_date, recipient_phone, recipient_name)
-- VALUES ('123', '30min', '2025-01-13', '558396910414', 'Gabriel Maia');