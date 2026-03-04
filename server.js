const { Client } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const cron = require('node-cron');
// PostgreSQL direct connection (replaces @supabase/supabase-js)
// const { GoogleGenerativeAI } = require('@google/generative-ai'); // COMENTADO - GEMINI AI
const https = require('https');
const fs = require('fs');
const path = require('path');

// Para desenvolvimento - aceitar certificados self-signed
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'https://api.medicosderesultado.com.br', 'https://cs.medicosderesultado.com.br'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.use(express.json());

let client;
let qrCodeData = null;
let isReady = false;
let isConnecting = false;

// Conexão direta com PostgreSQL (substituiu Supabase)
const supabase = require('./db');
const { generateToken, authMiddleware } = require('./auth-middleware');

const adminPhone = '558396910414'; // Gabriel Maia

// ===== AUTH ROUTES =====

// POST /auth/login
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        // Validate password via pgcrypto crypt()
        const result = await supabase.query(
            `SELECT id, nome, email, role, ativo, organization_id
             FROM usuarios_financeiro
             WHERE LOWER(email) = LOWER($1)
               AND senha_hash = crypt($2, senha_hash)
               AND ativo = true`,
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        const user = result.rows[0];

        // Get organization info
        const orgResult = await supabase.query(
            `SELECT organization_id, role, is_active
             FROM organization_users
             WHERE LOWER(email) = LOWER($1) AND is_active = true
             LIMIT 1`,
            [email]
        );

        const orgUser = orgResult.rows[0] || null;
        const organization_id = orgUser?.organization_id || user.organization_id;
        const role = orgUser?.role || user.role || 'viewer';

        if (!organization_id) {
            return res.status(403).json({ error: 'Usuário sem organização ativa' });
        }

        const token = generateToken({
            user_id: user.id,
            email: user.email,
            organization_id,
            role,
            nome: user.nome
        });

        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                nome: user.nome,
                role,
                organization_id
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        return res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// GET /auth/me
app.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const { user_id, email, organization_id } = req.user;

        const userResult = await supabase.query(
            `SELECT id, nome, email, role, organization_id
             FROM usuarios_financeiro
             WHERE id = $1 AND ativo = true`,
            [user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
        }

        const orgResult = await supabase.query(
            `SELECT organization_id, role, is_active
             FROM organization_users
             WHERE LOWER(email) = LOWER($1) AND is_active = true
             LIMIT 1`,
            [email]
        );

        const orgUser = orgResult.rows[0] || null;

        return res.json({
            user: {
                id: userResult.rows[0].id,
                email: userResult.rows[0].email,
                nome: userResult.rows[0].nome,
            },
            organization_id: orgUser?.organization_id || organization_id,
            role: orgUser?.role || userResult.rows[0].role,
            is_active: orgUser?.is_active ?? true
        });
    } catch (err) {
        console.error('❌ Auth/me error:', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// GET /api/dashboard
app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
        const { organization_id } = req.user;
        const { start, end } = req.query;

        // Run queries in parallel
        const queries = [
            // 1. All leads
            supabase.query(
                `SELECT id, origem, created_at, status, valor_vendido, valor_arrecadado,
                        data_venda, convertido_em, status_updated_at
                 FROM leads WHERE organization_id = $1`,
                [organization_id]
            ),
            // 2. Mentorados count
            supabase.query(
                start && end
                    ? `SELECT COUNT(*) as count FROM mentorados WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3`
                    : `SELECT COUNT(*) as count FROM mentorados WHERE organization_id = $1`,
                start && end ? [organization_id, start, end] : [organization_id]
            ),
            // 3. Calendar events count
            supabase.query(
                start && end
                    ? `SELECT COUNT(*) as count FROM calendar_events WHERE organization_id = $1 AND start_time >= $2 AND start_time <= $3`
                    : `SELECT COUNT(*) as count FROM calendar_events WHERE organization_id = $1 AND start_time >= NOW()`,
                start && end ? [organization_id, start, end] : [organization_id]
            ),
            // 4. Dividas pendentes
            supabase.query(
                `SELECT COUNT(DISTINCT mentorado_id) as count FROM dividas
                 WHERE organization_id = $1 AND status = 'pendente'`,
                [organization_id]
            ),
            // 5. Comissoes pendentes
            supabase.query(
                `SELECT COUNT(*) as count FROM comissoes
                 WHERE organization_id = $1 AND status = 'pendente'`,
                [organization_id]
            ),
            // 6. Recent leads
            supabase.query(
                `SELECT nome_completo, email, status, created_at, updated_at
                 FROM leads WHERE organization_id = $1
                 ORDER BY updated_at DESC LIMIT 5`,
                [organization_id]
            ),
            // 7. Recent mentorados
            supabase.query(
                `SELECT nome_completo, email, created_at, updated_at
                 FROM mentorados WHERE organization_id = $1
                 ORDER BY updated_at DESC LIMIT 3`,
                [organization_id]
            ),
            // 8. Revenue by month (last 6 months)
            supabase.query(
                `SELECT
                    date_trunc('month', COALESCE(data_venda::timestamptz, convertido_em, created_at)) as month,
                    SUM(COALESCE(valor_vendido, 0)) as total_vendido,
                    SUM(COALESCE(valor_arrecadado, 0)) as total_arrecadado,
                    COUNT(*) as count
                 FROM leads
                 WHERE organization_id = $1 AND status = 'vendido'
                   AND COALESCE(data_venda::timestamptz, convertido_em, created_at) >= NOW() - INTERVAL '6 months'
                 GROUP BY month ORDER BY month`,
                [organization_id]
            ),
        ];

        const [
            leadsResult, mentoradosResult, eventsResult,
            dividasResult, comissoesResult,
            recentLeadsResult, recentMentoradosResult, revenueResult
        ] = await Promise.all(queries);

        return res.json({
            leads: leadsResult.rows,
            mentorados_count: parseInt(mentoradosResult.rows[0]?.count || '0'),
            events_count: parseInt(eventsResult.rows[0]?.count || '0'),
            dividas_pendentes: parseInt(dividasResult.rows[0]?.count || '0'),
            comissoes_pendentes: parseInt(comissoesResult.rows[0]?.count || '0'),
            recent_leads: recentLeadsResult.rows,
            recent_mentorados: recentMentoradosResult.rows,
            revenue_by_month: revenueResult.rows
        });
    } catch (err) {
        console.error('❌ Dashboard error:', err);
        return res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Configuração do Gemini - COMENTADO
// const genAI = new GoogleGenerativeAI('AIzaSyCtkT3y-NwYgNWIotoBcDxvAmIDXN10vEY');
// const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Prompt para o SDR Antiplantão - COMENTADO
/* const SDR_PROMPT = `
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
`; */

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

// SDR ANTIPLANTÃO REMOVIDO COMPLETAMENTE

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

// Função para verificar organização do usuário por telefone
async function getUserOrganization(phoneNumber) {
    try {
        // Remover caracteres especiais
        let originalPhone = phoneNumber.replace(/\D/g, '');
        let cleanPhone = originalPhone;
        
        // Remover código do país (55) se presente
        if (cleanPhone.startsWith('55')) {
            cleanPhone = cleanPhone.substring(2);
        }
        
        // Testar todas as variações possíveis
        let numbersToTest = [];
        
        if (cleanPhone.length === 10) {
            // Número sem 9 (ex: 8399999999)
            numbersToTest = [
                cleanPhone, // 8399999999
                cleanPhone.substring(0, 2) + '9' + cleanPhone.substring(2), // 83999999999
                '55' + cleanPhone, // 558399999999
                '55' + cleanPhone.substring(0, 2) + '9' + cleanPhone.substring(2) // 5583999999999
            ];
        } else if (cleanPhone.length === 11 && cleanPhone.charAt(2) === '9') {
            // Número com 9 (ex: 83999999999)
            numbersToTest = [
                cleanPhone, // 83999999999
                cleanPhone.substring(0, 2) + cleanPhone.substring(3), // 8399999999
                '55' + cleanPhone, // 5583999999999
                '55' + cleanPhone.substring(0, 2) + cleanPhone.substring(3) // 558399999999
            ];
        } else {
            // Outros formatos
            numbersToTest = [cleanPhone];
            if (!originalPhone.startsWith('55')) {
                numbersToTest.push('55' + cleanPhone);
            }
        }

        console.log(`🔍 Buscando organização para números: ${numbersToTest.join(', ')}`);

        // Buscar na tabela organizations por admin_phone
        for (const testPhone of numbersToTest) {
            const { data: org, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('admin_phone', testPhone)
                .single();

            if (org && !error) {
                console.log('✅ Organização encontrada:', org.name);
                console.log('📞 Número testado que deu match:', testPhone);
                console.log('📞 admin_phone no banco:', org.admin_phone);
                return org;
            } else {
                console.log('❌ Não encontrado para:', testPhone);
            }
        }

        console.log(`❌ Nenhuma organização encontrada para ${phoneNumber}`);
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar organização:', error);
        return null;
    }
}

// Função para processar comando agenda
async function handleAgendaCommand(phoneNumber) {
    try {
        // Verificar se o usuário pertence a uma organização
        const organization = await getUserOrganization(phoneNumber);

        if (!organization) {
            return '❌ Você não faz parte de uma administração autorizada para usar este comando.';
        }

        console.log(`📋 Buscando agenda para organização: ${organization.name}`);

        // Buscar eventos do dia para a organização
        const events = await getEventsForOrganization(organization.id);

        if (!events || events.length === 0) {
            return `📅 *Programação do dia* (${new Date().toLocaleDateString('pt-BR')})\n\n✅ Nenhum compromisso agendado para hoje.`;
        }

        let agendaMessage = `📅 *Programação do dia* (${new Date().toLocaleDateString('pt-BR')})\n\n`;

        events.forEach((event, index) => {
            const eventStart = new Date(event.start_datetime);
            const timeStr = eventStart.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Sao_Paulo'
            });

            let participantName = 'Participante não identificado';
            if (event.mentorados && event.mentorados.nome_completo) {
                participantName = event.mentorados.nome_completo + ' (Mentorado)';
            } else if (event.leads && event.leads.nome_completo) {
                participantName = event.leads.nome_completo + ' (Lead)';
            }

            agendaMessage += `${index + 1}. ${timeStr} - ${event.title}\n`;
            agendaMessage += `   👤 ${participantName}\n\n`;
        });

        agendaMessage += '\n❓ *Você deseja ver informação de mais algum lead?*\n';
        agendaMessage += '📝 Se sim, digite a numeração da reunião.';

        // Armazenar temporariamente os eventos para consulta posterior
        global.userAgendaData = global.userAgendaData || {};
        global.userAgendaData[phoneNumber] = events;

        return agendaMessage;
    } catch (error) {
        console.error('❌ Erro ao processar comando agenda:', error);
        return '❌ Erro ao buscar agenda. Tente novamente em alguns instantes.';
    }
}

// Função para buscar faturamento de uma organização
async function getFaturamentoForOrganization(organizationId) {
    try {
        console.log('💰 Buscando faturamento para organização ID:', organizationId);

        // Buscar faturamento do mês atual
        const now = new Date();
        const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const { data: faturamento, error } = await supabase
            .from('faturamento')
            .select(`
                id,
                valor,
                data_faturamento,
                status,
                descricao,
                leads (
                    nome_completo,
                    telefone
                ),
                mentorados (
                    nome_completo,
                    telefone
                )
            `)
            .eq('organization_id', organizationId)
            .gte('data_faturamento', firstDayMonth.toISOString())
            .lte('data_faturamento', lastDayMonth.toISOString())
            .order('data_faturamento', { ascending: false });

        if (error) {
            console.error('❌ Erro ao buscar faturamento:', error);
            return { total: 0, arrecadado: 0, pendente: 0, items: [] };
        }

        const items = faturamento || [];
        const total = items.reduce((sum, item) => sum + (item.valor || 0), 0);
        const arrecadado = items.filter(item => item.status === 'pago').reduce((sum, item) => sum + (item.valor || 0), 0);
        const pendente = total - arrecadado;

        return { total, arrecadado, pendente, items };
    } catch (error) {
        console.error('❌ Erro na consulta de faturamento:', error);
        return { total: 0, arrecadado: 0, pendente: 0, items: [] };
    }
}

// Função para buscar pendências de uma organização
async function getPendenciasForOrganization(organizationId) {
    try {
        console.log('⚠️ Buscando pendências para organização ID:', organizationId);

        const { data: pendencias, error } = await supabase
            .from('faturamento')
            .select(`
                id,
                valor,
                data_faturamento,
                data_vencimento,
                descricao,
                leads (
                    nome_completo,
                    telefone
                ),
                mentorados (
                    nome_completo,
                    telefone
                )
            `)
            .eq('organization_id', organizationId)
            .eq('status', 'pendente')
            .order('data_vencimento');

        if (error) {
            console.error('❌ Erro ao buscar pendências:', error);
            return [];
        }

        return pendencias || [];
    } catch (error) {
        console.error('❌ Erro na consulta de pendências:', error);
        return [];
    }
}

// Função para buscar eventos da organização
async function getEventsForOrganization(organizationId) {
    try {
        // Usar timezone correto de São Paulo
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
                organization_id,
                mentorados (
                    nome_completo,
                    telefone
                ),
                leads (
                    nome_completo,
                    telefone
                )
            `)
            .eq('organization_id', organizationId)
            .gte('start_datetime', todayStartUTC.toISOString())
            .lte('start_datetime', todayEndUTC.toISOString())
            .order('start_datetime');

        if (error) {
            console.error('❌ Erro ao buscar eventos da organização:', error);
            return [];
        }

        return events || [];
    } catch (error) {
        console.error('❌ Erro na consulta de eventos da organização:', error);
        return [];
    }
}

// Função para processar comando de detalhes do lead
async function handleLeadDetailsCommand(phoneNumber, meetingNumber) {
    try {
        // Verificar se o usuário tem agenda armazenada
        if (!global.userAgendaData || !global.userAgendaData[phoneNumber]) {
            return '❌ Primeiro digite "agenda" para ver a lista de compromissos do dia.';
        }

        const events = global.userAgendaData[phoneNumber];
        const selectedEvent = events[meetingNumber - 1];

        if (!selectedEvent) {
            return `❌ Reunião número ${meetingNumber} não encontrada. Digite "agenda" para ver a lista completa.`;
        }

        let detailsMessage = `📋 *Detalhes da Reunião ${meetingNumber}*\n\n`;

        const eventStart = new Date(selectedEvent.start_datetime);
        const timeStr = eventStart.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        detailsMessage += `⏰ *Horário:* ${timeStr}\n`;
        detailsMessage += `📝 *Título:* ${selectedEvent.title}\n\n`;

        // Informações do participante
        if (selectedEvent.leads && selectedEvent.leads.nome_completo) {
            const lead = selectedEvent.leads;
            detailsMessage += `👤 *LEAD - ${lead.nome_completo}*\n`;
            detailsMessage += `📞 *Telefone:* ${lead.telefone || 'Não informado'}\n`;
            detailsMessage += `🌡️ *Temperatura:* ${getTemperatureEmoji(lead.temperatura)} ${lead.temperatura || 'Não definida'}\n`;
            detailsMessage += `📊 *Status:* ${lead.status || 'Não definido'}\n`;
            detailsMessage += `🎯 *Origem:* ${lead.origem || 'Não informada'}\n`;

            if (lead.observacoes) {
                detailsMessage += `📋 *Observações:*\n${lead.observacoes}\n`;
            }
        } else if (selectedEvent.mentorados && selectedEvent.mentorados.nome_completo) {
            const mentorado = selectedEvent.mentorados;
            detailsMessage += `👤 *MENTORADO - ${mentorado.nome_completo}*\n`;
            detailsMessage += `📞 *Telefone:* ${mentorado.telefone || 'Não informado'}\n`;
            detailsMessage += `🌡️ *Temperatura:* ${getTemperatureEmoji(mentorado.temperatura)} ${mentorado.temperatura || 'Não definida'}\n`;
        }

        if (selectedEvent.description) {
            detailsMessage += `\n📄 *Descrição:*\n${selectedEvent.description}\n`;
        }

        detailsMessage += '\n❓ *Deseja ver outro lead?*\n';
        detailsMessage += '📝 Digite o número da reunião ou "agenda" para ver a lista completa.';

        return detailsMessage;
    } catch (error) {
        console.error('❌ Erro ao processar detalhes do lead:', error);
        return '❌ Erro ao buscar detalhes. Tente novamente.';
    }
}

// Função auxiliar para emojis de temperatura
function getTemperatureEmoji(temp) {
    switch(temp?.toLowerCase()) {
        case 'quente':
        case 'hot':
            return '🔥';
        case 'morno':
        case 'warm':
            return '🟡';
        case 'frio':
        case 'cold':
            return '❄️';
        default:
            return '⚪';
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

        // Encaminhar mensagens de todos os números apenas para admin (sem resposta automática)
        if (!msg.fromMe && msg.body && msg.body.length > 0) {
            const cleanPhone = msg.from.replace('@c.us', '').replace('+', '');
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

        // Comando agenda
        if (!msg.fromMe && msg.body.toLowerCase().trim() === 'agenda') {
            try {
                console.log('📅 Processando comando agenda...');
                const response = await handleAgendaCommand(msg.from);
                await msg.reply(response);
                console.log('✅ Agenda enviada!');
            } catch (error) {
                console.error('❌ Erro ao processar agenda:', error);
                await msg.reply('❌ Erro ao buscar agenda. Tente novamente.');
            }
        }

        // Comando faturamento
        if (!msg.fromMe && msg.body.toLowerCase().trim() === 'faturamento') {
            try {
                console.log('💰 Processando comando faturamento...');
                
                const organization = await getUserOrganization(msg.from);
                if (!organization) {
                    await msg.reply('❌ Você não faz parte de uma organização autorizada para usar este comando.');
                    return;
                }

                const faturamento = await getFaturamentoForOrganization(organization.id);
                const now = new Date();
                const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

                let response = `💰 *FATURAMENTO DE ${monthName.toUpperCase()}*\n\n`;
                response += `📊 *RESUMO FINANCEIRO:*\n`;
                response += `• 💵 Total Faturado: R$ ${faturamento.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                response += `• ✅ Arrecadado: R$ ${faturamento.arrecadado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                response += `• ⏳ Pendente: R$ ${faturamento.pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;

                if (faturamento.items && faturamento.items.length > 0) {
                    response += `📋 *DETALHAMENTO (${faturamento.items.length} itens):*\n\n`;
                    
                    faturamento.items.slice(0, 10).forEach((item, index) => {
                        const data = new Date(item.data_faturamento).toLocaleDateString('pt-BR');
                        const status = item.status === 'pago' ? '✅' : '⏳';
                        const cliente = item.leads?.nome_completo || item.mentorados?.nome_completo || 'Cliente não identificado';
                        
                        response += `${index + 1}. ${status} R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                        response += `   📅 ${data} - ${cliente}\n`;
                        if (item.descricao) {
                            response += `   📝 ${item.descricao}\n`;
                        }
                        response += '\n';
                    });

                    if (faturamento.items.length > 10) {
                        response += `... e mais ${faturamento.items.length - 10} itens\n`;
                    }
                } else {
                    response += '📝 Nenhum faturamento registrado este mês.';
                }

                await msg.reply(response);
                console.log('✅ Faturamento enviado!');
            } catch (error) {
                console.error('❌ Erro ao processar faturamento:', error);
                await msg.reply('❌ Erro ao buscar faturamento. Tente novamente.');
            }
        }

        // Comando pendencias/pendencia
        if (!msg.fromMe && ['pendencia', 'pendencias'].includes(msg.body.toLowerCase().trim())) {
            try {
                console.log('⚠️ Processando comando pendências...');
                
                const organization = await getUserOrganization(msg.from);
                if (!organization) {
                    await msg.reply('❌ Você não faz parte de uma organização autorizada para usar este comando.');
                    return;
                }

                const pendencias = await getPendenciasForOrganization(organization.id);

                if (!pendencias || pendencias.length === 0) {
                    await msg.reply('✅ *PENDÊNCIAS FINANCEIRAS*\n\nNenhuma pendência encontrada! 🎉\nTodos os pagamentos estão em dia.');
                    return;
                }

                const totalPendente = pendencias.reduce((sum, item) => sum + (item.valor || 0), 0);

                let response = `⚠️ *PENDÊNCIAS FINANCEIRAS*\n\n`;
                response += `💰 *Total em Aberto: R$ ${totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
                response += `📊 Total de ${pendencias.length} pendência(s)\n\n`;

                response += `📋 *DETALHAMENTO:*\n\n`;

                pendencias.forEach((pendencia, index) => {
                    const dataVencimento = new Date(pendencia.data_vencimento);
                    const hoje = new Date();
                    const diasAtraso = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
                    const isVencida = diasAtraso > 0;
                    
                    const statusIcon = isVencida ? '🔴' : '🟡';
                    const statusText = isVencida ? `(${diasAtraso} dias em atraso)` : '(no prazo)';
                    
                    const cliente = pendencia.leads?.nome_completo || pendencia.mentorados?.nome_completo || 'Cliente não identificado';
                    const telefone = pendencia.leads?.telefone || pendencia.mentorados?.telefone;
                    
                    response += `${index + 1}. ${statusIcon} R$ ${pendencia.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                    response += `   👤 ${cliente}\n`;
                    if (telefone) {
                        response += `   📱 ${telefone}\n`;
                    }
                    response += `   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')} ${statusText}\n`;
                    if (pendencia.descricao) {
                        response += `   📝 ${pendencia.descricao}\n`;
                    }
                    response += '\n';
                });

                await msg.reply(response);
                console.log('✅ Pendências enviadas!');
            } catch (error) {
                console.error('❌ Erro ao processar pendências:', error);
                await msg.reply('❌ Erro ao buscar pendências. Tente novamente.');
            }
        }

        // Comando para detalhes de lead (numeração)
        if (!msg.fromMe && /^\d+$/.test(msg.body.trim())) {
            try {
                console.log('🔍 Processando comando de numeração...');
                const response = await handleLeadDetailsCommand(msg.from, parseInt(msg.body.trim()));
                if (response) {
                    await msg.reply(response);
                    console.log('✅ Detalhes do lead enviados!');
                }
            } catch (error) {
                console.error('❌ Erro ao processar detalhes do lead:', error);
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

// Middleware de autenticação para envio manual de mensagens
const authenticateManualMessage = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Token de autenticação necessário para envio manual de mensagens'
            });
        }

        const token = authHeader.substring(7); // Remove "Bearer "

        // Verificar token no Supabase
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                success: false,
                error: 'Token de autenticação inválido'
            });
        }

        // Adicionar usuário à requisição para uso posterior
        req.user = data.user;
        next();
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        return res.status(401).json({
            success: false,
            error: 'Erro de autenticação'
        });
    }
};

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

app.post('/send', authenticateManualMessage, async (req, res) => {
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
app.post('/users/default/send', authenticateManualMessage, async (req, res) => {
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
                    nome_completo,
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
                    if (event.mentorado_id && event.mentorados && event.mentorados.nome_completo) {
                        summaryMessage += ` (com ${event.mentorados.nome_completo})`;
                    } else if (event.lead_id && event.leads && event.leads.nome_completo) {
                        summaryMessage += ` (com ${event.leads.nome_completo} - lead)`;
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
                    console.log(`📱 Enviando mensagem para lead: ${event.leads.nome_completo} (${event.leads.telefone})`);

                    const message = `Olá ${event.leads.nome_completo}, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡`;

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
                        console.log(`✅ Lembrete enviado para lead: ${event.leads.nome_completo}`);
                    } else {
                        console.log(`❌ Falha ao enviar lembrete para lead: ${event.leads.nome_completo}`);
                    }
                } else {
                    console.log(`⏭️ Pulando lead - Motivo: lead_id=${!!event.lead_id}, leads=${!!event.leads}, telefone=${event.leads?.telefone}`);
                }

                // Para admin
                let adminMessage = '';
                if (event.mentorado_id && event.mentorados) {
                    adminMessage = `📅 Lembrete: Call com ${event.mentorados.nome_completo} (mentorado) em 30 minutos!\n\nEvento: ${event.title}`;
                } else if (event.lead_id && event.leads) {
                    adminMessage = `📅 Lembrete: Call com ${event.leads.nome_completo} (lead) em 30 minutos!\n\nEvento: ${event.title}`;
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


// [DESATIVADO] Follow-ups agora são processados no baileys-server-multi.js
// async function processFollowupsAutomatically() { ... }

// Configurar cron jobs
function setupCronJobs() {
    // Job principal: verificar a cada 2 minutos para lembretes de 30min
    cron.schedule('*/2 * * * *', () => {
        checkAndSendNotifications(false);
    });

    // Job para resumo diário às 7h da manhã (horário de São Paulo)
    // Executar às 13h UTC (7h SP + 3 horas de ajuste)
    cron.schedule('0 13 * * *', () => {
        console.log('🌅 Enviando resumo diário dos compromissos...');
        checkAndSendNotifications(true);
    });

    // [DESATIVADO] Follow-ups agora são processados no baileys-server-multi.js
    // cron.schedule('*/15 * * * *', () => { processFollowupsAutomatically(); });

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

// [DESATIVADO] Follow-ups agora são processados no baileys-server-multi.js
// app.post('/test-followups', ...) removido

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
                nome: event.leads?.nome_completo,
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

// [DESATIVADO] Follow-ups agora são processados no baileys-server-multi.js
// app.post('/api/process-followups', ...) removido — use POST /process-followups no baileys-server-multi

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


// ===== PUBLIC MENTORADO ROUTES (no auth required) =====
let bcrypt;
try {
    bcrypt = require('bcryptjs');
} catch (e) {
    console.warn('⚠️ bcryptjs not installed, using plain text password comparison only');
    bcrypt = {
        compare: async (password, hash) => password === hash,
        hash: async (password, rounds) => password,
    };
}

// POST /public/mentorados/login
app.post('/public/mentorados/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        // Buscar mentorado por email (case-insensitive)
        const result = await supabase.query(
            `SELECT * FROM mentorados WHERE LOWER(email) = LOWER($1) LIMIT 1`,
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        const mentorado = result.rows[0];

        // Check access blocking
        if (mentorado.estado_atual === 'churn') {
            return res.status(403).json({ error: 'Conta marcada como churn' });
        }
        if (mentorado.data_entrada) {
            const dataEntrada = new Date(mentorado.data_entrada);
            const agora = new Date();
            const diffMonths = (agora.getFullYear() - dataEntrada.getFullYear()) * 12 + (agora.getMonth() - dataEntrada.getMonth());
            if (diffMonths >= 12) {
                return res.status(403).json({ error: 'Período de acesso expirado (12 meses)' });
            }
        }
        if (mentorado.status_login && mentorado.status_login !== 'ativo') {
            return res.status(403).json({ error: 'Status de login inativo' });
        }

        // Verify password
        if (mentorado.password_hash) {
            const isBcrypt = /^\$2[aby]\$\d+\$/.test(mentorado.password_hash);
            if (isBcrypt) {
                const valid = await bcrypt.compare(password, mentorado.password_hash);
                if (!valid) {
                    return res.status(401).json({ error: 'Email ou senha incorretos' });
                }
            } else {
                // Plain text comparison
                if (password !== mentorado.password_hash) {
                    return res.status(401).json({ error: 'Email ou senha incorretos' });
                }
                // Migrate to bcrypt
                try {
                    const hash = await bcrypt.hash(password, 12);
                    await supabase.query(
                        `UPDATE mentorados SET password_hash = $1 WHERE id = $2`,
                        [hash, mentorado.id]
                    );
                    console.log(`🔄 Migrated password to bcrypt for mentorado ${mentorado.id}`);
                } catch (hashErr) {
                    console.warn('⚠️ Failed to migrate password hash:', hashErr.message);
                }
            }
        }
        // If no password_hash, allow any password (first login)

        // Generate JWT token for mentorado (so ApiQueryBuilder works)
        const mentoradoToken = generateToken({
            user_id: mentorado.id,
            email: mentorado.email,
            organization_id: mentorado.organization_id || '9c8c0033-15ea-4e33-a55f-28d81a19693b',
            role: 'mentorado',
            nome: mentorado.nome_completo,
            is_mentorado: true,
        });

        return res.json({
            success: true,
            token: mentoradoToken,
            mentorado: {
                id: mentorado.id,
                nome_completo: mentorado.nome_completo,
                email: mentorado.email,
                telefone: mentorado.telefone,
                estado_entrada: mentorado.estado_entrada,
                estado_atual: mentorado.estado_atual,
                data_entrada: mentorado.data_entrada,
                data_nascimento: mentorado.data_nascimento,
                endereco: mentorado.endereco,
                crm: mentorado.crm,
                cpf: mentorado.cpf,
                rg: mentorado.rg,
                origem_conhecimento: mentorado.origem_conhecimento,
                data_inicio_mentoria: mentorado.data_inicio_mentoria,
                status_login: mentorado.status_login,
                genero: mentorado.genero,
                especialidade: mentorado.especialidade,
                organization_id: mentorado.organization_id,
                created_at: mentorado.created_at,
                turma: mentorado.turma,
            }
        });
    } catch (err) {
        console.error('❌ Mentorado login error:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET /public/mentorados/validate/:id
app.get('/public/mentorados/validate/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'ID é obrigatório' });
        }

        const result = await supabase.query(
            `SELECT * FROM mentorados WHERE id = $1 LIMIT 1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Mentorado não encontrado' });
        }

        const mentorado = result.rows[0];

        // Check access blocking
        if (mentorado.estado_atual === 'churn') {
            return res.status(403).json({ error: 'Conta marcada como churn', blocked: true });
        }
        if (mentorado.data_entrada) {
            const dataEntrada = new Date(mentorado.data_entrada);
            const agora = new Date();
            const diffMonths = (agora.getFullYear() - dataEntrada.getFullYear()) * 12 + (agora.getMonth() - dataEntrada.getMonth());
            if (diffMonths >= 12) {
                return res.status(403).json({ error: 'Período de acesso expirado (12 meses)', blocked: true });
            }
        }
        if (mentorado.status_login && mentorado.status_login !== 'ativo') {
            return res.status(403).json({ error: 'Status de login inativo', blocked: true });
        }

        return res.json({
            success: true,
            mentorado: {
                id: mentorado.id,
                nome_completo: mentorado.nome_completo,
                email: mentorado.email,
                telefone: mentorado.telefone,
                estado_entrada: mentorado.estado_entrada,
                estado_atual: mentorado.estado_atual,
                data_entrada: mentorado.data_entrada,
                data_nascimento: mentorado.data_nascimento,
                endereco: mentorado.endereco,
                crm: mentorado.crm,
                cpf: mentorado.cpf,
                rg: mentorado.rg,
                origem_conhecimento: mentorado.origem_conhecimento,
                data_inicio_mentoria: mentorado.data_inicio_mentoria,
                status_login: mentorado.status_login,
                genero: mentorado.genero,
                especialidade: mentorado.especialidade,
                organization_id: mentorado.organization_id,
                created_at: mentorado.created_at,
                turma: mentorado.turma,
            }
        });
    } catch (err) {
        console.error('❌ Mentorado validate error:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST /public/mentorados/query - public query for mentorados table (read-only)
app.post('/public/mentorados/query', async (req, res) => {
    try {
        const { operation, select, filters, order, single, maybeSingle, limit: queryLimit, range } = req.body;

        // Only allow SELECT operations on mentorados table
        if (operation && operation !== 'select') {
            return res.status(403).json({ error: 'Only SELECT operations allowed on public endpoint' });
        }

        // Build SELECT query
        const columns = select || '*';
        let sql = `SELECT ${columns} FROM mentorados`;
        const params = [];
        let paramIdx = 1;

        // Apply filters
        if (filters && filters.length > 0) {
            const whereClauses = [];
            for (const f of filters) {
                if (f.type === 'eq') {
                    whereClauses.push(`${f.column} = $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'ilike') {
                    whereClauses.push(`${f.column} ILIKE $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'in') {
                    const placeholders = f.value.map(() => `$${paramIdx++}`).join(', ');
                    whereClauses.push(`${f.column} IN (${placeholders})`);
                    params.push(...f.value);
                } else if (f.type === 'is') {
                    if (f.value === null) {
                        whereClauses.push(`${f.column} IS NULL`);
                    } else {
                        whereClauses.push(`${f.column} IS $${paramIdx++}`);
                        params.push(f.value);
                    }
                }
            }
            if (whereClauses.length > 0) {
                sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }
        }

        // Apply order
        if (order && order.length > 0) {
            const orderClauses = order.map(o => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`);
            sql += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        // Apply limit
        if (queryLimit) {
            sql += ` LIMIT ${parseInt(queryLimit)}`;
        }

        if (single || maybeSingle) {
            sql += ' LIMIT 1';
        }

        const result = await supabase.query(sql, params);

        if (single) {
            if (result.rows.length === 0) {
                return res.json({ data: null, error: { message: 'Row not found', code: 'PGRST116' } });
            }
            return res.json({ data: result.rows[0], error: null });
        }

        if (maybeSingle) {
            return res.json({ data: result.rows[0] || null, error: null });
        }

        return res.json({ data: result.rows, error: null, count: result.rowCount });
    } catch (err) {
        console.error('❌ Public mentorado query error:', err);
        return res.status(500).json({ data: null, error: { message: err.message } });
    }
});

// =====================================================================
// Generic /api/query — used by ApiQueryBuilder on the frontend
// Supports: select, insert, update, delete, upsert
// =====================================================================
const ALLOWED_TABLES = [
    'mentorados', 'leads', 'organizations', 'organization_users',
    'profiles', 'usuarios_financeiro', 'calendar_events', 'notifications',
    'video_modules', 'video_lessons', 'video_progress', 'video_ratings',
    'module_ratings', 'continue_watching', 'mentorado_metas',
    'mentorado_atividades', 'mentorado_evolucao_financeira',
    'goal_checkpoints', 'pontuacao_mentorados', 'ranking_mentorados',
    'kanban_columns', 'kanban_tasks', 'kanban_boards', 'commissions', 'withdrawals',
    'referrals', 'referral_links', 'social_sellers', 'lead_notes',
    'whatsapp_conversations', 'whatsapp_messages', 'icp_form_templates', 'icp_responses',
    'form_responses', 'dores_desejos',
    // Closers / Sales team
    'closers', 'closers_vendas', 'closers_atividades', 'closers_metas', 'closers_dashboard_access',
    // Events
    'group_events', 'group_event_participants',
    // Forms
    'form_templates', 'form_submissions', 'formularios_respostas', 'formularios_analises',
    // Financial
    'dividas', 'historico_pagamentos',
    // Contracts
    'contract_templates', 'contracts', 'contract_signatures',
    // Misc
    'checkins', 'metas', 'nps_respostas', 'scoring_configurations',
    'video_form_templates', 'video_form_responses',
];

// Sanitize column names to prevent SQL injection
function sanitizeColumn(col) {
    return col.replace(/[^a-zA-Z0-9_]/g, '');
}

// =====================================================================
// RPC Endpoint — call PostgreSQL functions
// =====================================================================
const ALLOWED_RPC_FUNCTIONS = [
    'get_event_statistics', 'calculate_closer_metrics', 'calculate_commission',
    'process_referral_conversion', 'initialize_default_kanban', 'get_kanban_board_data',
    'move_kanban_task', 'update_continue_watching', 'process_mentorado_churn',
    'get_contracts_dashboard', 'add_event_participant', 'convert_event_participant',
    'get_contract_content', 'get_contract_for_signing', 'sign_contract_simple',
    'sign_contract', 'create_contract_from_template', 'create_default_contract_template',
    'expire_old_contracts',
];

app.post('/api/rpc/:name', async (req, res) => {
    try {
        const { name } = req.params;
        if (!ALLOWED_RPC_FUNCTIONS.includes(name)) {
            return res.status(400).json({ data: null, error: { message: `Function '${name}' not allowed` } });
        }

        const params = req.body || {};
        const paramNames = Object.keys(params);
        const paramValues = Object.values(params);

        let sql;
        if (paramNames.length === 0) {
            sql = `SELECT * FROM ${name}()`;
        } else {
            const namedParams = paramNames.map((n, i) => `${sanitizeColumn(n)} := $${i + 1}`).join(', ');
            sql = `SELECT * FROM ${name}(${namedParams})`;
        }

        console.log(`[RPC] Calling ${name} with params:`, paramNames);
        const result = await supabase.query(sql, paramValues);
        return res.json({ data: result.rows, error: null });
    } catch (err) {
        console.error(`[RPC] Error calling ${req.params.name}:`, err.message);
        return res.status(500).json({ data: null, error: { message: err.message, code: err.code } });
    }
});

// =====================================================================
// Helper: Parse Supabase-style select with JOINs
// Pattern: "col1, col2, relatedTable:fkColumn(col3, col4)"
// =====================================================================
function parseSelectWithJoins(selectStr, baseTable) {
    if (!selectStr || selectStr === '*') return { baseCols: '*', joins: [], hasJoins: false };

    const joins = [];
    // Match patterns like: tableName:fkColumn(col1, col2, col3)
    const joinRegex = /(\w+):(\w+)\(([^)]+)\)/g;
    let cleanSelect = selectStr;
    let match;

    while ((match = joinRegex.exec(selectStr)) !== null) {
        const [fullMatch, joinTable, fkColumn, joinColsStr] = match;
        if (!ALLOWED_TABLES.includes(joinTable)) continue; // Skip disallowed tables
        const joinCols = joinColsStr.split(',').map(c => c.trim()).map(sanitizeColumn);
        joins.push({ alias: joinTable, table: joinTable, fkColumn: sanitizeColumn(fkColumn), columns: joinCols });
        cleanSelect = cleanSelect.replace(fullMatch, '');
    }

    // Clean up leftover commas
    cleanSelect = cleanSelect.replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '').trim();
    if (!cleanSelect) cleanSelect = '*';

    return { baseCols: cleanSelect, joins, hasJoins: joins.length > 0 };
}

app.post('/api/query', async (req, res) => {
    try {
        const { table, operation, select, filters, order, single, maybeSingle,
                limit: queryLimit, range, data, onConflict, returning, count } = req.body;

        if (!table || !ALLOWED_TABLES.includes(table)) {
            return res.status(400).json({ data: null, error: { message: `Table '${table}' not allowed` } });
        }

        const params = [];
        let paramIdx = 1;

        // Build WHERE clause from filters
        function buildWhere() {
            if (!filters || filters.length === 0) return '';
            const clauses = [];
            for (const f of filters) {
                const col = sanitizeColumn(f.column || '');
                if (f.type === 'eq') {
                    clauses.push(`${col} = $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'neq') {
                    clauses.push(`${col} != $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'gt') {
                    clauses.push(`${col} > $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'gte') {
                    clauses.push(`${col} >= $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'lt') {
                    clauses.push(`${col} < $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'lte') {
                    clauses.push(`${col} <= $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'in') {
                    const ph = f.value.map(() => `$${paramIdx++}`).join(', ');
                    clauses.push(`${col} IN (${ph})`);
                    params.push(...f.value);
                } else if (f.type === 'is') {
                    if (f.value === null) clauses.push(`${col} IS NULL`);
                    else clauses.push(`${col} IS $${paramIdx++}`) && params.push(f.value);
                } else if (f.type === 'not') {
                    if (f.op === 'is' && f.value === null) clauses.push(`${col} IS NOT NULL`);
                    else if (f.op === 'eq') { clauses.push(`${col} != $${paramIdx++}`); params.push(f.value); }
                    else if (f.op === 'in') {
                        const ph = f.value.map(() => `$${paramIdx++}`).join(', ');
                        clauses.push(`${col} NOT IN (${ph})`);
                        params.push(...f.value);
                    }
                } else if (f.type === 'ilike') {
                    clauses.push(`${col} ILIKE $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'like') {
                    clauses.push(`${col} LIKE $${paramIdx++}`);
                    params.push(f.value);
                } else if (f.type === 'or') {
                    // Parse simple or conditions like "col1.eq.val1,col2.eq.val2"
                    const parts = (f.value || '').split(',');
                    const orClauses = [];
                    for (const part of parts) {
                        const m = part.match(/^(\w+)\.(eq|ilike|is|neq|gte|lte|gt|lt)\.(.+)$/);
                        if (m) {
                            const [, c, op, v] = m;
                            const sc = sanitizeColumn(c);
                            if (op === 'eq') { orClauses.push(`${sc} = $${paramIdx++}`); params.push(v); }
                            else if (op === 'neq') { orClauses.push(`${sc} != $${paramIdx++}`); params.push(v); }
                            else if (op === 'ilike') { orClauses.push(`${sc} ILIKE $${paramIdx++}`); params.push(v); }
                            else if (op === 'gte') { orClauses.push(`${sc} >= $${paramIdx++}`); params.push(v); }
                            else if (op === 'lte') { orClauses.push(`${sc} <= $${paramIdx++}`); params.push(v); }
                            else if (op === 'gt') { orClauses.push(`${sc} > $${paramIdx++}`); params.push(v); }
                            else if (op === 'lt') { orClauses.push(`${sc} < $${paramIdx++}`); params.push(v); }
                            else if (op === 'is' && v === 'null') { orClauses.push(`${sc} IS NULL`); }
                        }
                    }
                    if (orClauses.length > 0) clauses.push(`(${orClauses.join(' OR ')})`);
                }
            }
            return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
        }

        function buildOrder() {
            if (!order || order.length === 0) return '';
            return ' ORDER BY ' + order.map(o => `${sanitizeColumn(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ');
        }

        function buildLimit() {
            if (single || maybeSingle) return ' LIMIT 1';
            if (queryLimit) return ` LIMIT ${parseInt(queryLimit)}`;
            return '';
        }

        function buildOffset() {
            if (range) return ` OFFSET ${parseInt(range.from)} LIMIT ${parseInt(range.to) - parseInt(range.from) + 1}`;
            return '';
        }

        let result;

        if (operation === 'select' || !operation) {
            // SELECT — with Supabase-style JOIN support
            const columns = select || '*';
            const { baseCols, joins, hasJoins } = parseSelectWithJoins(columns, table);

            // Build WHERE clause once (captures params)
            const whereClause = buildWhere();
            const whereParams = [...params]; // snapshot for reuse

            let sql;
            if (!hasJoins) {
                sql = `SELECT ${baseCols} FROM ${table}`;
            } else {
                // Build SELECT with JOINs
                let selectParts;
                if (baseCols === '*') {
                    selectParts = `${table}.*`;
                } else {
                    selectParts = baseCols.split(',').map(c => {
                        const t = c.trim();
                        if (!t) return null;
                        return t.includes('.') ? t : `${table}.${sanitizeColumn(t)}`;
                    }).filter(Boolean).join(', ');
                }
                // Add joined columns as JSON objects
                for (const j of joins) {
                    const jsonParts = j.columns.map(c => `'${c}', ${j.alias}.${c}`).join(', ');
                    selectParts += `, CASE WHEN ${j.alias}.id IS NOT NULL THEN json_build_object(${jsonParts}) ELSE NULL END AS ${j.alias}`;
                }
                sql = `SELECT ${selectParts} FROM ${table}`;
                for (const j of joins) {
                    sql += ` LEFT JOIN ${j.table} AS ${j.alias} ON ${table}.${j.fkColumn} = ${j.alias}.id`;
                }
            }

            sql += whereClause;
            sql += buildOrder();
            sql += buildOffset() || buildLimit();

            // Count query (reuse same WHERE params)
            let countResult = null;
            if (count) {
                const countSql = `SELECT COUNT(*) as total FROM ${table}${whereClause}`;
                const cr = await supabase.query(countSql, whereParams);
                countResult = parseInt(cr.rows[0]?.total || 0);
            }

            result = await supabase.query(sql, whereParams);

            if (single) {
                if (result.rows.length === 0) {
                    return res.json({ data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: countResult });
                }
                return res.json({ data: result.rows[0], error: null, count: countResult });
            }
            if (maybeSingle) {
                return res.json({ data: result.rows[0] || null, error: null, count: countResult });
            }
            return res.json({ data: result.rows, error: null, count: countResult ?? result.rowCount });

        } else if (operation === 'insert') {
            const rows = Array.isArray(data) ? data : [data];
            if (rows.length === 0) return res.json({ data: [], error: null });

            const cols = Object.keys(rows[0]).map(sanitizeColumn);
            const valueSets = [];
            for (const row of rows) {
                const vals = cols.map(c => { params.push(row[c]); return `$${paramIdx++}`; });
                valueSets.push(`(${vals.join(', ')})`);
            }

            let sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${valueSets.join(', ')}`;
            if (onConflict) {
                sql += ` ON CONFLICT (${sanitizeColumn(onConflict)}) DO NOTHING`;
            }
            if (returning) sql += ' RETURNING *';

            result = await supabase.query(sql, params);
            return res.json({ data: returning ? result.rows : null, error: null, count: result.rowCount });

        } else if (operation === 'update') {
            if (!data || typeof data !== 'object') {
                return res.status(400).json({ data: null, error: { message: 'No data provided for update' } });
            }

            const setClauses = [];
            for (const [key, value] of Object.entries(data)) {
                setClauses.push(`${sanitizeColumn(key)} = $${paramIdx++}`);
                params.push(value);
            }

            let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;
            sql += buildWhere();
            if (returning) sql += ' RETURNING *';

            result = await supabase.query(sql, params);
            return res.json({ data: returning ? result.rows : null, error: null, count: result.rowCount });

        } else if (operation === 'delete') {
            let sql = `DELETE FROM ${table}`;
            sql += buildWhere();
            if (returning) sql += ' RETURNING *';

            result = await supabase.query(sql, params);
            return res.json({ data: returning ? result.rows : null, error: null, count: result.rowCount });

        } else if (operation === 'upsert') {
            const rows = Array.isArray(data) ? data : [data];
            if (rows.length === 0) return res.json({ data: [], error: null });

            const cols = Object.keys(rows[0]).map(sanitizeColumn);
            const valueSets = [];
            for (const row of rows) {
                const vals = cols.map(c => { params.push(row[c]); return `$${paramIdx++}`; });
                valueSets.push(`(${vals.join(', ')})`);
            }

            const conflictCol = onConflict || 'id';
            const updateCols = cols.filter(c => c !== conflictCol).map(c => `${c} = EXCLUDED.${c}`).join(', ');

            let sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${valueSets.join(', ')}`;
            sql += ` ON CONFLICT (${sanitizeColumn(conflictCol)}) DO UPDATE SET ${updateCols}`;
            if (returning) sql += ' RETURNING *';

            result = await supabase.query(sql, params);
            return res.json({ data: returning ? result.rows : null, error: null, count: result.rowCount });

        } else {
            return res.status(400).json({ data: null, error: { message: `Unknown operation: ${operation}` } });
        }
    } catch (err) {
        console.error('❌ /api/query error:', err);
        return res.status(500).json({ data: null, error: { message: err.message, code: err.code } });
    }
});

// =====================================================================
// Leads paginated search endpoint
// =====================================================================
app.post('/api/leads/search', async (req, res) => {
    try {
        const { organization_id, search, status, origem, date_filter, custom_start, custom_end, page = 1, limit = 10 } = req.body;
        if (!organization_id) return res.status(400).json({ data: null, error: { message: 'organization_id required' } });

        const params = [organization_id];
        let paramIdx = 2;
        const conditions = ['organization_id = $1'];

        if (status && status !== 'todos') {
            conditions.push(`status = $${paramIdx++}`);
            params.push(status);
        }
        if (origem && origem !== 'todas') {
            conditions.push(`origem = $${paramIdx++}`);
            params.push(origem);
        }
        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            conditions.push(`(nome_completo ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR telefone ILIKE $${paramIdx} OR empresa ILIKE $${paramIdx})`);
            params.push(term);
            paramIdx++;
        }

        // Date filtering
        if (date_filter && date_filter !== 'todos') {
            const now = new Date();
            let startDate, endDate;

            if (date_filter === 'mes_atual') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
            } else if (date_filter === 'ano_atual') {
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = now;
            } else if (date_filter === 'semana_atual') {
                const day = now.getDay();
                const diff = day === 0 ? 6 : day - 1;
                startDate = new Date(now); startDate.setDate(now.getDate() - diff); startDate.setHours(0,0,0,0);
                endDate = now;
            } else if (date_filter === 'semana_passada') {
                const day = now.getDay();
                const diff = day === 0 ? 6 : day - 1;
                const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - diff); thisMonday.setHours(0,0,0,0);
                startDate = new Date(thisMonday); startDate.setDate(thisMonday.getDate() - 7);
                endDate = new Date(thisMonday); endDate.setSeconds(-1);
            } else if (date_filter === 'mes_passado') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0); endDate.setHours(23,59,59,999);
            } else if (date_filter === 'personalizado' && custom_start && custom_end) {
                startDate = new Date(custom_start);
                endDate = new Date(custom_end); endDate.setHours(23,59,59,999);
            }

            if (startDate && endDate) {
                conditions.push(`created_at >= $${paramIdx++}`);
                params.push(startDate.toISOString());
                conditions.push(`created_at <= $${paramIdx++}`);
                params.push(endDate.toISOString());
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Count total
        const countSql = `SELECT COUNT(*) as total FROM leads ${whereClause}`;
        const countResult = await supabase.query(countSql, params);
        const total = parseInt(countResult.rows[0]?.total || 0);

        // Fetch page
        const dataSql = `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
        const dataResult = await supabase.query(dataSql, params);

        return res.json({
            data: dataResult.rows,
            count: total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
            error: null
        });
    } catch (err) {
        console.error('❌ /api/leads/search error:', err);
        return res.status(500).json({ data: null, error: { message: err.message }, count: 0 });
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