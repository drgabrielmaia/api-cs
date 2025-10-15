const { Client } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
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

        // Verificar se é mensagem qualquer enviada em resposta (também deve encaminhar para admin)
        if (!msg.fromMe && msg.body && msg.body.length > 0) {
            // Se a mensagem não é de bot/automação, encaminhar para admin
            const contact = await msg.getContact();
            const participantName = contact.pushname || contact.name || msg.from.replace('@c.us', '');
            const forwardMessage = `💬 Mensagem de ${participantName}:\n"${msg.body}"`;

            try {
                await client.sendMessage('5583996910414@c.us', forwardMessage);
                console.log(`📤 Mensagem encaminhada para admin`);
            } catch (error) {
                console.error(`❌ Erro ao encaminhar mensagem para admin:`, error);
            }
        }

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
        await client.sendMessage(to, message);
        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.json({ success: false, error: 'Erro ao enviar mensagem' });
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