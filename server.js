const { Client } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Para desenvolvimento - aceitar certificados self-signed
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const app = express();
const port = process.env.PORT || 3001;

// app.use(cors()); // Comentado - nginx gerencia CORS
app.use(express.json());

let client;
let qrCodeData = null;
let isReady = false;
let isConnecting = false;

// Configuração do Supabase
const supabaseUrl = 'https://udzmlnnztzzwrphhizol.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';
const supabase = createClient(supabaseUrl, supabaseKey);

const adminPhone = '558396910414'; // Gabriel Maia
const targetPhone = '5511986784297'; // Número que o SDR deve responder

// Configuração do Gemini
const genAI = new GoogleGenerativeAI('AIzaSyCtkT3y-NwYgNWIotoBcDxvAmIDXN10vEY');
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Prompt para o SDR Antiplantão
const SDR_PROMPT = `
Você é um SDR (Sales Development Representative) especializado do movimento ANTIPLANTÃO, criado por Gabriel Maia.

CONTEXTO DO NEGÓCIO:
- O movimento antiplantão foca em fazer com que médicos sejam bem remunerados SEM se matar de trabalhar
- Queremos que médicos ganhem dinheiro sem precisar de plantões, PSF ou trabalhar no SUS
- Vendemos LIBERDADE para médicos
- O diploma mais forte do país não pode aceitar biomédico ganhando mais que médico
- A mentoria custa R$ 40.000, mas o valor só é revelado durante a call

SEU OBJETIVO PRINCIPAL:
Convencer médicos a agendarem uma call com Gabriel Maia para conhecer o movimento antiplantão.

COMO VOCÊ DEVE SE COMUNICAR:
1. Seja direto, provocativo e persuasivo
2. Use linguagem informal e próxima do médico
3. Foque na DOR: médicos mal remunerados, sobrecarregados, dependentes do SUS
4. Apresente a SOLUÇÃO: liberdade financeira através do movimento antiplantão
5. Crie URGÊNCIA para agendar a call
6. NÃO mencione o valor da mentoria - apenas na call
7. Use emojis moderadamente para humanizar

ESTRATÉGIA DE CONVERSÃO:
- Identifique se a pessoa é médico
- Desperte interesse sobre liberdade financeira
- Gere curiosidade sobre o movimento
- Ofereça valor exclusivo
- Conduza para agendamento da call
- Se houver interesse, ofereça horários concretos para agendar

FRASES DE IMPACTO:
- "Médico ganhando menos que biomédico? Isso precisa acabar!"
- "Quantos plantões você vai fazer até aposentar?"
- "E se eu te disser que existe um jeito de ganhar mais trabalhando menos?"
- "Liberdade financeira é direito de quem estudou medicina"

AGENDAMENTO DE CALLS:
- Quando o prospect demonstrar interesse, ofereça horários específicos
- Sugestões: "Que tal amanhã às 14h?" ou "Tenho uma vaga quinta às 16h"
- Sempre pergunte nome completo e confirme o número de WhatsApp
- Se aceitar, confirme todos os dados antes de finalizar

RESPONDA SEMPRE buscando agendar uma call. Seja conversacional, natural e focado no resultado.

Agora responda a mensagem a seguir como um SDR expert:
`;

// Função para verificar se número existe no WhatsApp (com e sem 9)
async function verifyWhatsAppNumber(baseNumber) {
    try {
        // Remove tudo que não é número
        const cleanNumber = baseNumber.replace(/\D/g, '');

        // Formatos possíveis para números brasileiros
        let numbersToTest = [];

        if (cleanNumber.length === 10) {
            // Número sem 9 (ex: 5511987654321 -> 11987654321)
            numbersToTest = [
                `${cleanNumber}`, // sem 9
                `${cleanNumber.slice(0, 2)}9${cleanNumber.slice(2)}` // com 9
            ];
        } else if (cleanNumber.length === 11) {
            // Número com 9 (ex: 5511987654321)
            if (cleanNumber.charAt(4) === '9') {
                numbersToTest = [
                    `${cleanNumber}`, // com 9
                    `${cleanNumber.slice(0, 4)}${cleanNumber.slice(5)}` // sem 9
                ];
            } else {
                numbersToTest = [`${cleanNumber}`];
            }
        } else {
            numbersToTest = [`${cleanNumber}`];
        }

        console.log(`🔍 Testando números: ${numbersToTest.join(', ')}`);

        // Testar cada formato
        for (const number of numbersToTest) {
            try {
                const whatsappId = `${number}@c.us`;
                const isRegistered = await client.isRegisteredUser(whatsappId);

                if (isRegistered) {
                    console.log(`✅ Número encontrado: ${whatsappId}`);
                    return whatsappId;
                }

                console.log(`❌ Número não encontrado: ${whatsappId}`);
            } catch (checkError) {
                console.log(`⚠️ Erro ao verificar ${number}:`, checkError.message);
                continue;
            }
        }

        console.log(`❌ Nenhum formato válido encontrado para: ${baseNumber}`);
        return null;

    } catch (error) {
        console.error('❌ Erro na verificação de número:', error);
        return null;
    }
}

// Função para enviar mensagem com verificação automática de número
async function sendMessageWithNumberCheck(phoneNumber, message) {
    try {
        const validWhatsAppId = await verifyWhatsAppNumber(phoneNumber);

        if (!validWhatsAppId) {
            console.log(`❌ Número ${phoneNumber} não possui WhatsApp`);
            return { success: false, error: 'Número não possui WhatsApp' };
        }

        await client.sendMessage(validWhatsAppId, message);
        console.log(`✅ Mensagem enviada para: ${validWhatsAppId}`);
        return { success: true, whatsappId: validWhatsAppId };

    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        return { success: false, error: error.message };
    }
}

// Função do SDR Antiplantão
async function processSDRMessage(messageText, contactName) {
    try {
        const prompt = SDR_PROMPT + `\n\nMENSAGEM RECEBIDA: "${messageText}"\nNOME DO CONTATO: ${contactName || 'Não identificado'}\n\nResposta do SDR:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error('❌ Erro ao gerar resposta do SDR:', error);
        return `Olá! 👋 Sou do movimento ANTIPLANTÃO.

Médico ganhando menos que biomédico? Isso precisa acabar!

Gabriel Maia criou um método para médicos ganharem dinheiro SEM plantões, SEM PSF, SEM SUS.

Quer saber como? Vamos agendar uma call rápida? 📞`;
    }
}

// Função para marcar evento como mensagem enviada
async function markEventMessageSent(eventId) {
    try {
        const { error } = await supabase
            .from('calendar_events')
            .update({ mensagem_enviada: true })
            .eq('id', eventId);

        if (error) {
            console.error('❌ Erro ao marcar evento como enviado:', error.message);
            return false;
        }

        console.log(`✅ Evento ${eventId} marcado como mensagem enviada`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao atualizar evento:', error);
        return false;
    }
}

function initializeClient() {
    client = new Client();

    client.on('qr', async (qr) => {
        console.log('QR RECEIVED', qr);
        isConnecting = true;
        isReady = false;

        try {
            qrCodeData = await QRCode.toDataURL(qr);
            console.log('QR Code gerado para API');
        } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
        }
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        isReady = true;
        isConnecting = false;
        qrCodeData = null;
    });

    client.on('message', async (msg) => {
        // Ignorar mensagens de status/stories
        if (msg.from === 'status@broadcast') {
            return;
        }

        console.log('=============================');
        console.log('📨 MENSAGEM RECEBIDA:');
        console.log('From:', msg.from);
        console.log('Body:', msg.body);
        console.log('IsFromMe:', msg.fromMe);
        console.log('=============================');

        // Verificar se é uma resposta a botão de confirmação de call
        if (msg.type === 'buttons_response') {
            const buttonId = msg.selectedButtonId;
            console.log(`🔘 Botão clicado: ${buttonId}`);

            if (buttonId && buttonId.startsWith('confirm_call_')) {
                const eventId = buttonId.replace('confirm_call_', '');
                console.log(`✅ Confirmação de call recebida para evento: ${eventId}`);

                // Encaminhar mensagem para admin
                const contact = await msg.getContact();
                const participantName = contact.pushname || contact.name || msg.from.replace('@c.us', '');
                const confirmMessage = `✅ ${participantName} confirmou presença na call (Evento ID: ${eventId})`;

                try {
                    await client.sendMessage('5583996910414@c.us', confirmMessage);
                    console.log(`📤 Confirmação encaminhada para admin`);
                } catch (error) {
                    console.error(`❌ Erro ao encaminhar confirmação para admin:`, error);
                }
            }
        }

        // SDR ANTIPLANTÃO - Responder apenas ao número específico
        const cleanPhone = msg.from.replace('@c.us', '').replace('+', '');
        console.log(`🔍 Verificando número: ${cleanPhone} vs ${targetPhone}`);

        if (!msg.fromMe && msg.body && msg.body.length > 0 && cleanPhone === targetPhone) {
            console.log(`🎯 MENSAGEM DO NÚMERO ALVO! Ativando SDR...`);

            try {
                const contact = await msg.getContact();
                const contactName = contact.pushname || contact.name || 'Prospect';

                console.log(`👤 Processando mensagem para: ${contactName}`);
                console.log(`💬 Mensagem: "${msg.body}"`);

                // Gerar resposta com Gemini SDR
                const sdrResponse = await processSDRMessage(msg.body, contactName);

                console.log(`🤖 Resposta do SDR: "${sdrResponse}"`);

                // Enviar resposta
                await msg.reply(sdrResponse);
                console.log(`✅ Resposta SDR enviada!`);

                // Notificar admin sobre a interação
                const adminNotification = `🚀 SDR ANTIPLANTÃO ativo!\n\n👤 Prospect: ${contactName}\n📞 ${cleanPhone}\n💬 Perguntou: "${msg.body}"\n🤖 Respondi: "${sdrResponse}"`;
                await client.sendMessage(`${adminPhone}@c.us`, adminNotification);

            } catch (error) {
                console.error('❌ Erro no SDR:', error);

                // Resposta de fallback
                const fallbackMessage = `Olá! 👋 Sou do movimento ANTIPLANTÃO.

Médico ganhando menos que biomédico? Isso precisa acabar!

Gabriel Maia criou um método para médicos ganharem dinheiro SEM plantões, SEM PSF, SEM SUS.

Quer saber como? Vamos agendar uma call rápida? 📞`;

                await msg.reply(fallbackMessage);
                console.log(`✅ Resposta de fallback enviada!`);
            }
        }

        // Encaminhar mensagens de outros números apenas para admin (sem resposta automática)
        else if (!msg.fromMe && msg.body && msg.body.length > 0 && cleanPhone !== targetPhone) {
            const contact = await msg.getContact();
            const participantName = contact.pushname || contact.name || msg.from.replace('@c.us', '');
            const forwardMessage = `💬 Mensagem de ${participantName} (${cleanPhone}):\n"${msg.body}"`;

            try {
                await client.sendMessage(`${adminPhone}@c.us`, forwardMessage);
                console.log(`📤 Mensagem encaminhada para admin`);
            } catch (error) {
                console.error(`❌ Erro ao encaminhar mensagem para admin:`, error);
            }
        }

        // Comando de teste (ping)
        if (!msg.fromMe && msg.body.toLowerCase().includes('ping')) {
            try {
                console.log('🏓 Respondendo com pong...');
                await msg.reply('pong');
                console.log('✅ Pong enviado!');
            } catch (error) {
                console.error('❌ Erro ao responder:', error);
            }
        }
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out:', reason);
        isReady = false;
        isConnecting = false;
        qrCodeData = null;
    });

    client.initialize();
}

// Rotas da API
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'WhatsApp API is running' });
});

app.get('/status', (req, res) => {
    res.json({
        success: true,
        data: {
            isReady: isReady,
            isConnecting: isConnecting,
            hasQR: qrCodeData !== null,
            contactsCount: 0,
            messagesCount: 0
        }
    });
});

app.get('/qr', (req, res) => {
    if (qrCodeData) {
        res.json({
            success: true,
            data: {
                qr: qrCodeData,
                qrImage: qrCodeData
            }
        });
    } else {
        res.json({
            success: false,
            error: isReady ? 'Cliente já conectado' : 'QR Code não disponível'
        });
    }
});

app.post('/send', async (req, res) => {
    const { to, message } = req.body;

    if (!isReady) {
        return res.json({
            success: false,
            error: 'Cliente WhatsApp não está conectado'
        });
    }

    try {
        // Usar verificação automática de número
        const result = await sendMessageWithNumberCheck(to, message);

        if (result.success) {
            res.json({
                success: true,
                message: 'Mensagem enviada com sucesso',
                whatsappId: result.whatsappId
            });
        } else {
            res.json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.json({ success: false, error: 'Erro ao enviar mensagem' });
    }
});

// Rota para verificar se número existe no WhatsApp
app.post('/verify-number', async (req, res) => {
    const { phone } = req.body;

    if (!isReady) {
        return res.json({
            success: false,
            error: 'Cliente WhatsApp não está conectado'
        });
    }

    if (!phone) {
        return res.json({
            success: false,
            error: 'Número de telefone é obrigatório'
        });
    }

    try {
        const validWhatsAppId = await verifyWhatsAppNumber(phone);

        if (validWhatsAppId) {
            res.json({
                success: true,
                hasWhatsApp: true,
                whatsappId: validWhatsAppId,
                originalPhone: phone
            });
        } else {
            res.json({
                success: true,
                hasWhatsApp: false,
                whatsappId: null,
                originalPhone: phone
            });
        }
    } catch (error) {
        console.error('Erro ao verificar número:', error);
        res.json({ success: false, error: 'Erro ao verificar número' });
    }
});

// Endpoint para registro de usuário padrão (compatibilidade com sistema anterior)
app.post('/users/default/register', async (req, res) => {
    try {
        console.log('📝 Tentativa de registro de usuário:', req.body);

        // Simular resposta de sucesso para compatibilidade
        res.json({
            success: true,
            message: 'Usuário registrado com sucesso',
            data: {
                userId: 'default',
                status: 'registered',
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Erro no registro:', error);
        res.json({
            success: false,
            error: 'Erro ao registrar usuário'
        });
    }
});

// Endpoint para envio de mensagem via rota de usuário padrão
app.post('/users/default/send', async (req, res) => {
    const { to, message } = req.body;

    if (!isReady) {
        return res.json({
            success: false,
            error: 'Cliente WhatsApp não está conectado'
        });
    }

    try {
        await client.sendMessage(to, message);
        console.log(`📱 Mensagem enviada via /users/default/send para: ${to}`);
        res.json({
            success: true,
            message: 'Mensagem enviada com sucesso',
            data: {
                to: to,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem via users/default/send:', error);
        res.json({ success: false, error: 'Erro ao enviar mensagem' });
    }
});

app.get('/messages', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

app.get('/contacts', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

app.get('/messages/:chatId', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

// Página HTML para mostrar QR Code
app.get('/', (req, res) => {
    if (isReady) {
        res.send(`
            <html>
                <head><title>WhatsApp API</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>✅ WhatsApp Conectado!</h1>
                    <p>O cliente WhatsApp está conectado e pronto para uso.</p>
                    <p><strong>API Endpoints:</strong></p>
                    <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
                        <li>GET /status - Status da conexão</li>
                        <li>GET /qr - QR Code (quando disponível)</li>
                        <li>POST /send - Enviar mensagem</li>
                    </ul>
                </body>
            </html>
        `);
    } else if (qrCodeData) {
        res.send(`
            <html>
                <head><title>WhatsApp QR Code</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>📱 Conecte seu WhatsApp</h1>
                    <p>Escaneie o QR Code com seu WhatsApp:</p>
                    <img src="${qrCodeData}" alt="QR Code" style="margin: 20px;"/>
                    <p><em>Aguardando conexão...</em></p>
                    <script>
                        setTimeout(() => {
                            window.location.reload();
                        }, 5000);
                    </script>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <head><title>WhatsApp API</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>⏳ Carregando WhatsApp...</h1>
                    <p>Aguardando QR Code...</p>
                    <script>
                        setTimeout(() => {
                            window.location.reload();
                        }, 3000);
                    </script>
                </body>
            </html>
        `);
    }
});

// Função para obter horário de São Paulo usando timezone correta
function getSaoPauloTime() {
    return new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"});
}

// Função para buscar eventos do dia no Supabase
async function getEventsForToday() {
    try {
        // Usar timezone correto de São Paulo (UTC-3 sem horário de verão, UTC-2 com horário de verão)
        const saoPauloTime = new Date(getSaoPauloTime());

        const todayStart = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        // Converter para UTC para consulta no banco
        const todayStartUTC = new Date(todayStart.getTime() - saoPauloTime.getTimezoneOffset() * 60000);
        const todayEndUTC = new Date(todayEnd.getTime() - saoPauloTime.getTimezoneOffset() * 60000);

        const { data: events, error } = await supabase
            .from('calendar_events')
            .select(`
                id,
                title,
                description,
                start_datetime,
                end_datetime,
                mentorado_id,
                lead_id,
                mensagem_enviada,
                mentorados (
                    nome_completo,
                    telefone
                ),
                leads (
                    nome,
                    telefone
                )
            `)
            .gte('start_datetime', todayStartUTC.toISOString())
            .lte('start_datetime', todayEndUTC.toISOString())
            .order('start_datetime');

        if (error) {
            console.error('Erro ao buscar eventos:', error);
            return [];
        }

        return events || [];
    } catch (error) {
        console.error('Erro na consulta de eventos:', error);
        return [];
    }
}

// Função para enviar mensagem via WhatsApp
async function sendWhatsAppMessage(phoneNumber, message) {
    if (!isReady) {
        console.error('Cliente WhatsApp não está conectado');
        return false;
    }

    try {
        // Garantir que o número tenha o formato correto
        let formattedNumber = phoneNumber.replace(/\D/g, '');
        if (!formattedNumber.startsWith('55')) {
            formattedNumber = '55' + formattedNumber;
        }
        formattedNumber += '@c.us';

        await client.sendMessage(formattedNumber, message);
        console.log(`✅ Mensagem enviada para ${phoneNumber}: ${message.substring(0, 50)}...`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar para ${phoneNumber}:`, error);
        return false;
    }
}

// Função principal para verificar e enviar notificações
async function checkAndSendNotifications(isDailySummary = false) {
    console.log(isDailySummary ? '🌅 Enviando resumo diário...' : '🔄 Verificando eventos para notificações...');

    if (!isReady) {
        console.log('⚠️ WhatsApp não está conectado. Pulando verificação.');
        return;
    }

    try {
        const events = await getEventsForToday();

        // Usar horário correto de São Paulo
        const saoPauloNow = new Date(getSaoPauloTime());
        const currentHour = saoPauloNow.getHours();
        const currentMinute = saoPauloNow.getMinutes();

        let notificationsSent = 0;

        // Se for resumo diário das 7h
        if (isDailySummary) {
            if (events.length > 0) {
                let summaryMessage = '🌅 Bom dia! Aqui estão seus compromissos de hoje:\n\n';

                events.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

                for (const event of events) {
                    const eventStart = new Date(event.start_datetime);
                    // Converter para horário de São Paulo
                    const eventSaoPaulo = new Date(eventStart.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                    const timeStr = eventSaoPaulo.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});

                    summaryMessage += `• ${timeStr} - ${event.title}`;
                    if (event.mentorado_id && event.mentorados) {
                        summaryMessage += ` (com ${event.mentorados.nome_completo})`;
                    } else if (event.lead_id && event.leads) {
                        summaryMessage += ` (com ${event.leads.nome} - lead)`;
                    }
                    summaryMessage += '\n';
                }

                summaryMessage += '\nTenha um ótimo dia! 🚀';

                const sent = await sendWhatsAppMessage(adminPhone, summaryMessage);
                if (sent) {
                    console.log('✅ Resumo diário enviado com sucesso!');
                    notificationsSent++;
                }
            } else {
                console.log('ℹ️ Nenhum evento hoje para enviar resumo.');
            }
            return;
        }

        // Verificações de lembretes (apenas 30 minutos antes)
        for (const event of events) {
            const eventStart = new Date(event.start_datetime);
            // Converter para horário de São Paulo
            const eventSaoPaulo = new Date(eventStart.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
            const timeDiffMinutes = (eventSaoPaulo - saoPauloNow) / (1000 * 60);

            // Enviar apenas lembrete de 30 minutos (mais preciso: entre 28 e 32 minutos)
            if (timeDiffMinutes >= 28 && timeDiffMinutes <= 32) {
                // Verificar se já enviou mensagem para este evento (campo direto na tabela)
                if (event.mensagem_enviada) {
                    console.log(`⏭️ Lembrete já enviado para: ${event.title} - campo mensagem_enviada = true`);
                    continue;
                }

                console.log(`⏰ Enviando lembrete de 30min para: ${event.title} (diff: ${Math.round(timeDiffMinutes)}min)`);

                // Marcar como enviado ANTES de enviar mensagem
                const marked = await markEventMessageSent(event.id);
                if (!marked) {
                    console.log(`❌ Falha ao marcar evento ${event.id} como enviado. Pulando para evitar spam.`);
                    continue;
                }

                // Para mentorado
                if (event.mentorado_id && event.mentorados && event.mentorados.telefone) {
                    const message = `Olá ${event.mentorados.nome_completo}, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡`;

                    const messageWithButton = {
                        text: message,
                        buttons: [{
                            buttonId: `confirm_call_${event.id}`,
                            buttonText: { displayText: 'Tudo certo!' },
                            type: 1
                        }],
                        headerType: 1
                    };

                    const sent = await sendWhatsAppMessage(event.mentorados.telefone, messageWithButton);

                    // Agendar mensagem de follow-up em 10 minutos se não receber resposta
                    setTimeout(async () => {
                        // Verificar se ainda não recebeu resposta
                        const followUpMessage = "É importante que você clique no botão acima.";
                        await sendWhatsAppMessage(event.mentorados.telefone, followUpMessage);
                    }, 10 * 60 * 1000); // 10 minutos

                    if (sent) {
                        notificationsSent++;
                        console.log(`✅ Lembrete enviado para mentorado: ${event.mentorados.nome_completo}`);
                    }
                }

                // Para lead (mesmo tipo de mensagem)
                console.log(`🔍 Debug lead - event.lead_id: ${event.lead_id}, event.leads: ${JSON.stringify(event.leads)}`);

                if (event.lead_id && event.leads && event.leads.telefone) {
                    console.log(`📱 Enviando mensagem para lead: ${event.leads.nome} (${event.leads.telefone})`);

                    const message = `Olá ${event.leads.nome}, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡`;

                    const messageWithButton = {
                        text: message,
                        buttons: [{
                            buttonId: `confirm_call_${event.id}`,
                            buttonText: { displayText: 'Tudo certo!' },
                            type: 1
                        }],
                        headerType: 1
                    };

                    const sent = await sendWhatsAppMessage(event.leads.telefone, messageWithButton);

                    // Agendar mensagem de follow-up em 10 minutos se não receber resposta
                    setTimeout(async () => {
                        // Verificar se ainda não recebeu resposta
                        const followUpMessage = "É importante que você clique no botão acima.";
                        await sendWhatsAppMessage(event.leads.telefone, followUpMessage);
                    }, 10 * 60 * 1000); // 10 minutos

                    if (sent) {
                        notificationsSent++;
                        console.log(`✅ Lembrete enviado para lead: ${event.leads.nome}`);
                    } else {
                        console.log(`❌ Falha ao enviar lembrete para lead: ${event.leads.nome}`);
                    }
                } else {
                    console.log(`⏭️ Pulando lead - Motivo: lead_id=${!!event.lead_id}, leads=${!!event.leads}, telefone=${event.leads?.telefone}`);
                }

                // Para admin
                let adminMessage = '';
                if (event.mentorado_id && event.mentorados) {
                    adminMessage = `📅 Lembrete: Call com ${event.mentorados.nome_completo} (mentorado) em 30 minutos!\n\nEvento: ${event.title}`;
                } else if (event.lead_id && event.leads) {
                    adminMessage = `📅 Lembrete: Call com ${event.leads.nome} (lead) em 30 minutos!\n\nEvento: ${event.title}`;
                } else {
                    adminMessage = `📅 Lembrete: ${event.title} em 30 minutos!`;
                }

                if (event.description) {
                    adminMessage += `\n\nDescrição: ${event.description}`;
                }

                const sentAdmin = await sendWhatsAppMessage(adminPhone, adminMessage);
                if (sentAdmin) {
                    notificationsSent++;
                    console.log(`✅ Lembrete enviado para admin sobre: ${event.title}`);
                }
            }
        }

        console.log(`✅ Verificação concluída. ${notificationsSent} notificações enviadas.`);

    } catch (error) {
        console.error('❌ Erro na verificação de notificações:', error);
    }
}

// Configurar cron jobs
function setupCronJobs() {
    // Job principal: verificar a cada 2 minutos para lembretes de 30min
    cron.schedule('*/2 * * * *', () => {
        checkAndSendNotifications(false);
    });

    // Job para resumo diário às 7h da manhã (horário de São Paulo)
    // Executar às 7h no horário de São Paulo
    cron.schedule('0 7 * * *', () => {
        console.log('🌅 Enviando resumo diário dos compromissos...');
        checkAndSendNotifications(true);
    }, {
        timezone: "America/Sao_Paulo"
    });

    console.log('⏰ Cron jobs configurados:');
    console.log('   - Verificação de lembretes a cada 2 minutos (30min antes)');
    console.log('   - Resumo diário às 7h da manhã (horário de São Paulo)');
}

// Endpoint para testar notificações manualmente
app.post('/test-notifications', async (req, res) => {
    const { isDailySummary } = req.body;
    console.log('🧪 Testando sistema de notificações...');
    await checkAndSendNotifications(isDailySummary || false);
    res.json({ success: true, message: `Teste de ${isDailySummary ? 'resumo diário' : 'notificações'} executado` });
});

// Endpoint para debug de eventos com leads
app.get('/debug/events', async (req, res) => {
    try {
        const events = await getEventsForToday();

        console.log('🔍 Debug - Total eventos encontrados:', events.length);

        const debugInfo = events.map(event => ({
            id: event.id,
            title: event.title,
            start_datetime: event.start_datetime,
            mensagem_enviada: event.mensagem_enviada,
            mentorado: {
                id: event.mentorado_id,
                nome: event.mentorados?.nome_completo,
                telefone: event.mentorados?.telefone
            },
            lead: {
                id: event.lead_id,
                nome: event.leads?.nome,
                telefone: event.leads?.telefone
            }
        }));

        console.log('📊 Debug eventos:', JSON.stringify(debugInfo, null, 2));

        res.json({
            success: true,
            total: events.length,
            events: debugInfo
        });
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        res.json({ success: false, error: error.message });
    }
});

// Endpoint para listar eventos de hoje
app.get('/events/today', async (req, res) => {
    try {
        const events = await getEventsForToday();
        res.json({ success: true, data: events });
    } catch (error) {
        res.json({ success: false, error: 'Erro ao buscar eventos' });
    }
});

// Endpoint para agendar call (usado pelo SDR)
app.post('/schedule-call', async (req, res) => {
    try {
        const { phone, name, date, time, notes } = req.body;

        if (!phone || !name || !date || !time) {
            return res.json({
                success: false,
                error: 'Dados obrigatórios: phone, name, date, time'
            });
        }

        // Inserir agendamento na tabela calendar_events
        const { data, error } = await supabase
            .from('calendar_events')
            .insert([{
                title: `Call Antiplantão - ${name}`,
                start_time: `${date}T${time}:00`,
                end_time: `${date}T${time.split(':')[0]}:${parseInt(time.split(':')[1]) + 30}:00`, // +30 min
                description: `Call agendada pelo SDR\nContato: ${phone}\nNotes: ${notes || 'Sem observações'}`,
                created_at: new Date().toISOString(),
                mensagem_enviada: false
            }])
            .select();

        if (error) {
            console.error('❌ Erro ao agendar call:', error);
            return res.json({ success: false, error: 'Erro ao agendar call' });
        }

        // Notificar admin sobre o agendamento
        const notification = `📅 NOVA CALL AGENDADA pelo SDR!

👤 Nome: ${name}
📞 Telefone: ${phone}
🗓️ Data: ${date}
⏰ Horário: ${time}
📝 Observações: ${notes || 'Nenhuma'}

ID do evento: ${data[0]?.id}`;

        try {
            await client.sendMessage(`${adminPhone}@c.us`, notification);
        } catch (msgError) {
            console.error('❌ Erro ao notificar admin:', msgError);
        }

        res.json({
            success: true,
            message: 'Call agendada com sucesso!',
            data: {
                eventId: data[0]?.id,
                scheduledFor: `${date} às ${time}`
            }
        });

    } catch (error) {
        console.error('❌ Erro no agendamento:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// SERVIDOR HTTP SIMPLES
app.listen(port, () => {
    console.log(`🚀 WhatsApp API rodando em HTTP na porta ${port}`);
    console.log(`🌐 URL: http://217.196.60.199:${port}`);

    initializeClient();

    // Configurar jobs após 5 segundos
    setTimeout(() => {
        setupCronJobs();
    }, 5000);
});