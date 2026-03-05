-- =====================================================================
-- Migration 24: Community + ICP Image + Ranking Fix + Airbnb/Eventos Improvements
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Mentorado Avatar
-- =====================================================================
ALTER TABLE mentorados ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- =====================================================================
-- 2. Ranking: Trigger to sync pontuacao_total automatically
-- =====================================================================
CREATE OR REPLACE FUNCTION sync_pontuacao_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE mentorados
  SET pontuacao_total = (
    SELECT COALESCE(SUM(pontos), 0)
    FROM pontuacao_mentorados
    WHERE mentorado_id = COALESCE(NEW.mentorado_id, OLD.mentorado_id)
  )
  WHERE id = COALESCE(NEW.mentorado_id, OLD.mentorado_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_pontuacao ON pontuacao_mentorados;
CREATE TRIGGER trg_sync_pontuacao
  AFTER INSERT OR UPDATE OR DELETE ON pontuacao_mentorados
  FOR EACH ROW EXECUTE FUNCTION sync_pontuacao_total();

-- Backfill: sync existing pontuacao data
UPDATE mentorados m
SET pontuacao_total = COALESCE(
  (SELECT SUM(pontos) FROM pontuacao_mentorados pm WHERE pm.mentorado_id = m.id), 0
);

-- =====================================================================
-- 3. Eventos: Replay + Lista de Espera
-- =====================================================================
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS replay_url TEXT;
ALTER TABLE group_events ADD COLUMN IF NOT EXISTS replay_disponivel_ate TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS evento_lista_espera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
  mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  posicao INTEGER NOT NULL DEFAULT 1,
  notificado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, mentorado_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_event ON evento_lista_espera(event_id);

-- =====================================================================
-- 4. Airbnb: Fotos Verificadas + Destaque + Contrato + Chat
-- =====================================================================
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS fotos_verificadas BOOLEAN DEFAULT false;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS destaque BOOLEAN DEFAULT false;

ALTER TABLE clinica_reservas ADD COLUMN IF NOT EXISTS termos_aceitos BOOLEAN DEFAULT false;
ALTER TABLE clinica_reservas ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS clinica_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  lida BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinica_msgs_clinica ON clinica_mensagens(clinica_id);
CREATE INDEX IF NOT EXISTS idx_clinica_msgs_dest ON clinica_mensagens(destinatario_id);

-- =====================================================================
-- 5. Comunidade / Feed / Stories
-- =====================================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'post' CHECK (tipo IN ('post', 'story')),
  conteudo TEXT,
  imagem_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_community_posts_org ON community_posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_tipo ON community_posts(tipo);
CREATE INDEX IF NOT EXISTS idx_community_posts_expires ON community_posts(expires_at) WHERE tipo = 'story';

CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'like' CHECK (tipo IN ('like', 'love', 'fire')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, mentorado_id)
);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions(post_id);

CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  mentorado_id UUID NOT NULL REFERENCES mentorados(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id);

-- Function to cleanup expired stories (called via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_stories()
RETURNS void AS $$
BEGIN
  DELETE FROM community_posts
  WHERE tipo = 'story' AND expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;
