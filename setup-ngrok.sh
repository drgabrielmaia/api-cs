#!/bin/bash

echo "🔧 Configurando ngrok..."

# Verificar se tem token
if [ -z "$NGROK_TOKEN" ]; then
    echo "❌ Configure seu NGROK_TOKEN primeiro:"
    echo "export NGROK_TOKEN=seu_token_aqui"
    echo ""
    echo "📝 Para obter token:"
    echo "1. Acesse: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "2. Copie seu token"
    echo "3. Execute: export NGROK_TOKEN=seu_token"
    exit 1
fi

# Adicionar token ao ngrok.yml
sed -i "s/authtoken: .*/authtoken: $NGROK_TOKEN/" ngrok.yml

echo "✅ Token configurado!"
echo "🚀 Iniciando containers..."

# Iniciar containers
docker-compose up -d

echo ""
echo "🌐 URLs disponíveis:"
echo "📡 API Local: http://localhost:3001"
echo "🔗 ngrok Web UI: http://localhost:4040"
echo ""
echo "⏳ Aguarde alguns segundos e acesse http://localhost:4040 para ver a URL HTTPS pública!"