# 📅 Comando Agenda - WhatsApp API

## ✅ **IMPLEMENTAÇÃO CONCLUÍDA**

A funcionalidade de comando "agenda" foi implementada com sucesso na API WhatsApp.

## 🚀 **Como Funciona**

### 1. **Comando Principal: "agenda"**
- **Input:** Usuário envia "agenda" no WhatsApp
- **Processo:**
  1. Sistema verifica se o número pertence a uma organização
  2. Se não pertencer: retorna mensagem de não autorização
  3. Se pertencer: busca eventos do dia da organização
  4. Retorna lista numerada dos compromissos

### 2. **Comando de Detalhes: número (ex: "1", "2", "3")**
- **Input:** Usuário digita apenas um número
- **Processo:**
  1. Sistema busca o evento correspondente à numeração
  2. Retorna detalhes completos do lead/mentorado
  3. Pergunta se deseja ver outro lead

## 📱 **Exemplo de Uso**

**Usuário:** `agenda`

**Bot:**
```
📅 Agenda do dia (29/01/2025)

1. 14:30 - Call Comercial - João Silva
   👤 João Silva (Lead)

2. 16:00 - Mentoria - Maria Santos
   👤 Maria Santos (Mentorado)

❓ Você deseja ver informação de mais algum lead?
📝 Se sim, digite a numeração da reunião.
```

**Usuário:** `1`

**Bot:**
```
📋 Detalhes da Reunião 1

⏰ Horário: 14:30
📝 Título: Call Comercial - João Silva

👤 LEAD - João Silva
📞 Telefone: (11) 99999-1234
🌡️ Temperatura: 🔥 quente
📊 Status: qualificado
🎯 Origem: instagram
📋 Observações:
Interessado na mentoria, tem consultório próprio

❓ Deseja ver outro lead?
📝 Digite o número da reunião ou "agenda" para ver a lista completa.
```

## 🔒 **Segurança e Autorização**

### Verificação de Organização:
- Sistema busca na tabela `organizations` por `owner_phone`
- Testa números com e sem o 9º dígito automaticamente
- Se não encontrar organização: nega acesso

### Mensagem de Não Autorização:
```
❌ Você não faz parte de uma administração autorizada para usar este comando.
```

## 🛠 **Funcionalidades Técnicas**

### 1. **Verificação de Telefone Inteligente**
- Remove caracteres especiais
- Testa com e sem 9º dígito
- Compatível com diferentes formatos brasileiros

### 2. **Cache Temporário**
- Armazena agenda do usuário na memória (`global.userAgendaData`)
- Permite navegação entre detalhes sem nova consulta
- Limpa automaticamente quando API reinicia

### 3. **Timezone São Paulo**
- Todos os horários exibidos em timezone correto
- Busca eventos apenas do dia atual (São Paulo)

### 4. **Emojis Dinâmicos**
- 🔥 Quente/Hot
- 🟡 Morno/Warm
- ❄️ Frio/Cold
- ⚪ Não definido

## 📋 **Informações Exibidas**

### Para Leads:
- Nome completo
- Telefone
- Temperatura (quente/morno/frio)
- Status
- Origem
- Observações (se houver)

### Para Mentorados:
- Nome completo
- Telefone
- Temperatura

### Para Ambos:
- Horário da reunião
- Título do evento
- Descrição (se houver)

## ⚙️ **Configuração**

O sistema está integrado ao servidor principal (`server.js`) e funciona automaticamente quando:

1. ✅ WhatsApp Web está conectado
2. ✅ Organização está cadastrada com telefone correto
3. ✅ Eventos estão agendados no sistema

## 🔧 **Manutenção**

- **Reiniciar API:** Para carregar mudanças no código
- **Reconectar WhatsApp:** Escanear QR code se necessário
- **Verificar logs:** Monitorar console para debugging

---

**🎯 Status: FUNCIONANDO ✅**
**📅 Data: 29/01/2025**
**👨‍💻 Desenvolvido por: Claude Code**