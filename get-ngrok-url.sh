#!/bin/bash

echo "🔍 Buscando URL do ngrok..."

# Aguardar ngrok iniciar
sleep 3

# Pegar URL HTTPS
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*' | head -1)

if [ -n "$NGROK_URL" ]; then
    echo "✅ URL ngrok encontrada:"
    echo "🌐 $NGROK_URL"
    echo ""
    echo "📋 Cole essa URL no seu frontend!"
else
    echo "❌ ngrok ainda não está pronto. Aguarde alguns segundos e tente novamente."
fi