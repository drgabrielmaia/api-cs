#!/bin/bash

# Criar diretório SSL se não existir
mkdir -p ssl

# Gerar certificado self-signed com SAN (Subject Alternative Name)
openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes \
  -subj "/C=BR/ST=State/L=City/O=Organization/CN=217.196.60.199" \
  -addext "subjectAltName=DNS:localhost,IP:217.196.60.199,IP:127.0.0.1"

echo "✅ Certificados SSL gerados com sucesso!"
echo "📁 Arquivos criados:"
echo "   - ssl/key.pem (chave privada)"
echo "   - ssl/cert.pem (certificado)"
echo ""
echo "🚀 Agora você pode rodar: docker-compose up --build"