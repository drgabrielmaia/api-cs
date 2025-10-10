#!/bin/bash

# Script de correção urgente para parar spam de mensagens
echo "🚨 CORREÇÃO URGENTE: Parando spam de mensagens WhatsApp"

echo "1. Fazendo backup do arquivo atual..."
cp baileys-server-multi.js baileys-server-multi.js.backup.$(date +%Y%m%d_%H%M%S)

echo "2. As seguintes correções foram aplicadas:"
echo "   ✅ Mudou cron de 2 para 5 minutos"
echo "   ✅ Adicionou controle anti-spam"
echo "   ✅ Implementou chave única por evento"
echo "   ✅ Sistema de limpeza automática"

echo "3. Para aplicar as correções:"
echo "   - Copie o arquivo baileys-server-multi.js atualizado para o servidor"
echo "   - Reinicie o serviço: pm2 restart all (ou docker restart)"

echo "4. As mensagens repetidas foram causadas por:"
echo "   - Cron executando a cada 2 minutos sem controle"
echo "   - Sem verificação de mensagens já enviadas"
echo "   - Mesmo evento sendo processado múltiplas vezes"

echo "5. Status atual:"
echo "   🛡️ Proteção implementada contra spam"
echo "   ⏰ Intervalo aumentado para 5 minutos"
echo "   🔑 Chave única por evento e horário"
echo "   🧹 Limpeza automática de 6 em 6 horas"

echo ""
echo "⚠️  AÇÃO NECESSÁRIA:"
echo "   1. Faça deploy deste arquivo corrigido"
echo "   2. Reinicie o serviço imediatamente"
echo "   3. Monitore os logs para confirmar que parou"

echo ""
echo "✅ Correção completa. Deploy necessário para ativar."