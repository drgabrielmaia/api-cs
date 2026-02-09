const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { settingsManager } = require('./organization-settings');

// Storage para mapear @lid para números reais encontrados
const lidToPhoneMap = new Map();


// ⭐ SOLUÇÃO 2: Resolver @lid usando API do WhatsApp
async function resolveLidViaAPI(lidId, session) {
    try {
        console.log(`🔍 [${session?.userId}] Tentando resolver ${lidId} via API...`);
        
        // Tentar endpoint de contatos
        if (session?.sock && session.sock.onWhatsApp) {
            const result = await session.sock.onWhatsApp(lidId);
            if (result && result.length > 0 && result[0].jid) {
                const resolvedJid = result[0].jid;
                if (resolvedJid.includes('@s.whatsapp.net')) {
                    const realNumber = resolvedJid.replace('@s.whatsapp.net', '');
                    console.log(`🎯 API resolveu ${lidId} → ${realNumber}`);
                    return realNumber;
                }
            }
        }
        
        // Tentar buscar info do contato diretamente
        if (session?.sock && session.sock.fetchContact) {
            const contactInfo = await session.sock.fetchContact(lidId);
            if (contactInfo && contactInfo.number) {
                console.log(`🎯 FetchContact resolveu ${lidId} → ${contactInfo.number}`);
                return contactInfo.number;
            }
        }
        
    } catch (error) {
        console.log(`❌ Erro ao resolver ${lidId} via API:`, error.message);
    }
    return null;
}

// ⭐ SOLUÇÃO 3: Salvar mapeamento no banco de dados
async function saveLidMappingToDatabase(lidId, realNumber) {
    try {
        const { data, error } = await supabase
            .from('lid_phone_mappings')
            .upsert({
                lid_id: lidId,
                real_phone: realNumber,
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'lid_id' 
            });
            
        if (error) {
            console.log('❌ Erro ao salvar mapeamento LID no BD:', error.message);
        } else {
            console.log(`💾 Mapeamento salvo no BD: ${lidId} → ${realNumber}`);
        }
    } catch (error) {
        console.log('❌ Erro ao salvar no BD:', error.message);
    }
}

// ⭐ SOLUÇÃO 3: Buscar mapeamento salvo no banco de dados
async function getLidMappingFromDatabase(lidId) {
    try {
        const { data, error } = await supabase
            .from('lid_phone_mappings')
            .select('real_phone')
            .eq('lid_id', lidId)
            .single();
            
        if (data && data.real_phone) {
            console.log(`💾 Mapeamento encontrado no BD: ${lidId} → ${data.real_phone}`);
            return data.real_phone;
        }
    } catch (error) {
        console.log('Erro ao buscar no BD:', error.message);
    }
    return null;
}

// Função para extrair números reais de várias propriedades - VERSÃO AVANÇADA
async function extractRealPhoneNumber(contact, chatId, session = null) {
    if (!contact && !chatId) return '';
    
    // ⭐ PRIORIDADE 1: Verificar cache em memória
    if (chatId && lidToPhoneMap.has(chatId)) {
        console.log(`💾 Cache: ${chatId} → ${lidToPhoneMap.get(chatId)}`);
        return lidToPhoneMap.get(chatId);
    }
    
    // ⭐ PRIORIDADE 2: Verificar banco de dados
    if (chatId && chatId.includes('@lid')) {
        const dbNumber = await getLidMappingFromDatabase(chatId);
        if (dbNumber) {
            lidToPhoneMap.set(chatId, dbNumber); // Salvar no cache também
            return dbNumber;
        }
    }
    
    // Lista de possíveis números para testar
    let possibleNumbers = [];
    
    // 3. Se tem contact, verificar várias propriedades
    if (contact) {
        if (contact.phone) possibleNumbers.push(contact.phone);
        if (contact.phoneNumber) possibleNumbers.push(contact.phoneNumber);
        if (contact.number) possibleNumbers.push(contact.number);
        if (contact.verifiedName) {
            const phoneFromName = contact.verifiedName.match(/(\d{10,15})/);
            if (phoneFromName) possibleNumbers.push(phoneFromName[1]);
        }
        if (contact.notify && /^\+?\d{10,15}$/.test(contact.notify.replace(/\D/g, ''))) {
            possibleNumbers.push(contact.notify.replace(/\D/g, ''));
        }
    }
    
    // ⭐ PRIORIDADE 5: Tentar resolver via API do WhatsApp
    if (possibleNumbers.length === 0 && chatId && chatId.includes('@lid')) {
        const apiNumber = await resolveLidViaAPI(chatId, session);
        if (apiNumber) {
            lidToPhoneMap.set(chatId, apiNumber);
            await saveLidMappingToDatabase(chatId, apiNumber);
            return apiNumber;
        }
    }
    
    // 6. Filtrar e validar números encontrados nas propriedades
    for (let num of possibleNumbers) {
        const cleanNum = num.replace(/\D/g, '');
        if (cleanNum.length >= 10 && cleanNum.length <= 15) {
            // Salvar mapeamento se for @lid
            if (chatId && chatId.includes('@lid')) {
                lidToPhoneMap.set(chatId, cleanNum);
                await saveLidMappingToDatabase(chatId, cleanNum);
            }
            return cleanNum;
        }
    }
    
    return '';
}

// Função para limpar número de telefone de sufixos WhatsApp e extrair número real
async function cleanPhoneNumber(phoneId, contact = null, session = null) {
    if (!phoneId) return '';
    
    // Se é @lid, tentar extrair número real primeiro usando TODAS as soluções
    if (phoneId.includes('@lid')) {
        const realNumber = await extractRealPhoneNumber(contact, phoneId, session);
        if (realNumber) {
            console.log(`🎯 SUCESSO! Número real encontrado para ${phoneId}: ${realNumber}`);
            return realNumber;
        }
        
        // Se não achou, extrair ID básico
        const match = phoneId.match(/(\d+):/);
        const extracted = match ? match[1] : phoneId.replace('@lid', '');
        console.log(`⚠️ Fallback - Usando ID @lid para ${phoneId}: ${extracted}`);
        return extracted;
    }
    
    return phoneId
        .replace('@s.whatsapp.net', '')
        .replace('@g.us', '');
}

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'https://api.medicosderesultado.com.br'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
})); // CORS habilitado para localhost:3000
app.use(express.json());

// Multi-user WhatsApp sessions storage
const userSessions = new Map(); // userId -> session data
const userSSEClients = new Map(); // userId -> Set of SSE clients

// Sistema de logs para monitoramento
const notificationLogs = [];
const MAX_LOGS = 100; // Manter últimos 100 logs

function addNotificationLog(type, message, data = {}) {
    const logEntry = {
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        type, // 'info', 'success', 'error', 'debug'
        message,
        data,
        id: Date.now()
    };

    notificationLogs.unshift(logEntry);

    // Manter apenas os últimos logs
    if (notificationLogs.length > MAX_LOGS) {
        notificationLogs.splice(MAX_LOGS);
    }

    // Log no console também
    const emoji = {
        'info': 'ℹ️',
        'success': '✅',
        'error': '❌',
        'debug': '🔍',
        'warning': '⚠️'
    }[type] || '📝';

    console.log(`${emoji} [${logEntry.timestamp}] ${message}`, data && Object.keys(data).length > 0 ? data : '');
}

// Configuração do Supabase
const supabaseUrl = 'https://udzmlnnztzzwrphhizol.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para obter número do admin baseado na organização
const getAdminPhone = async (organizationId = 'default') => {
  return await settingsManager.getAdminPhone(organizationId);
};
const defaultUserId = 'default'; // Usuário padrão para notificações

// === FUNÇÕES PARA ENVIO MULTI-ORGANIZACIONAL ===

// Função para buscar todas as organizações com WhatsApp ativo
const getAllOrganizationsWithWhatsApp = async () => {
  try {
    console.log('🏢 Buscando todas as organizações com WhatsApp ativo...');

    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, name, admin_phone, owner_email')
      .not('admin_phone', 'is', null)
      .neq('admin_phone', '');

    if (error) {
      console.error('❌ Erro ao buscar organizações:', error);
      return [];
    }

    console.log(`✅ ${organizations.length} organizações encontradas com WhatsApp`);

    // Filtrar apenas organizações que têm sessão WhatsApp conectada
    const activeOrganizations = [];

    for (const org of organizations) {
      const session = userSessions.get(org.id);
      if (session && session.isReady) {
        activeOrganizations.push(org);
        console.log(`✅ ${org.name} (${org.id}) - WhatsApp CONECTADO`);
      } else {
        console.log(`⚠️ ${org.name} (${org.id}) - WhatsApp NÃO CONECTADO`);
      }
    }

    console.log(`🚀 ${activeOrganizations.length} organizações prontas para envio`);
    return activeOrganizations;

  } catch (error) {
    console.error('❌ Erro ao buscar organizações:', error);
    return [];
  }
};

// Função para enviar mensagem usando sessão específica da organização
const sendWhatsAppMessageForOrganization = async (organizationId, phoneNumber, message) => {
  const session = userSessions.get(organizationId);

  if (!session || !session.sock || !session.isReady) {
    console.error(`❌ [${organizationId}] WhatsApp não está conectado`);
    return false;
  }

  try {
    // Resolver @lid para número real primeiro
    const cleanedNumber = await cleanPhoneNumber(phoneNumber, null, session);
    let formattedNumber = cleanedNumber.replace(/\D/g, '');
    if (!formattedNumber.endsWith('@s.whatsapp.net')) {
      formattedNumber += '@s.whatsapp.net';
    }

    let messageContent;
    if (typeof message === 'object' && message !== null) {
      messageContent = message;
    } else {
      messageContent = { text: message };
    }

    await session.sock.sendMessage(formattedNumber, messageContent);
    console.log(`✅ [${organizationId}] Mensagem enviada para ${phoneNumber}`);
    return true;

  } catch (error) {
    console.error(`❌ [${organizationId}] Erro ao enviar mensagem:`, error);
    return false;
  }
};

// Função para enviar resumo diário para todas as organizações
const sendDailySummaryToAllOrganizations = async (summaryMessage) => {
  try {
    console.log('🌅 Enviando resumo diário para todas as organizações...');

    const organizations = await getAllOrganizationsWithWhatsApp();

    if (organizations.length === 0) {
      console.log('⚠️ Nenhuma organização com WhatsApp conectado encontrada');
      return false;
    }

    let successfulSends = 0;

    for (const org of organizations) {
      console.log(`📱 Enviando para: ${org.name} - ${org.admin_phone}`);

      const sent = await sendWhatsAppMessageForOrganization(org.id, org.admin_phone, summaryMessage);

      if (sent) {
        successfulSends++;
        console.log(`✅ ${org.name}: Resumo enviado com sucesso!`);
      } else {
        console.log(`❌ ${org.name}: Falha no envio`);
      }

      // Aguardar 2 segundos entre envios para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`📊 RESUMO: ${successfulSends}/${organizations.length} organizações receberam a agenda`);
    return successfulSends > 0;

  } catch (error) {
    console.error('❌ Erro no envio para todas as organizações:', error);
    return false;
  }
};

// === FIM DAS FUNÇÕES MULTI-ORGANIZACIONAIS ===

// Configuração do SDR ANTIPLANTÃO - DESATIVADO
// const targetPhone = '5511986784297'; // Número que o SDR deve responder
const genAI = new GoogleGenerativeAI('AIzaSyCtkT3y-NwYgNWIotoBcDxvAmIDXN10vEY');
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Sistema de memória de conversas para SDR
const conversationMemory = new Map(); // phoneNumber -> [{role: 'user'|'assistant', content: 'message'}]

// Função para adicionar mensagem ao histórico
function addToConversationMemory(phoneNumber, role, message) {
    if (!conversationMemory.has(phoneNumber)) {
        conversationMemory.set(phoneNumber, []);
    }

    const history = conversationMemory.get(phoneNumber);
    history.push({ role, content: message, timestamp: new Date() });

    // Manter apenas as últimas 20 mensagens para não sobrecarregar
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }

    console.log(`💾 Histórico atualizado para ${phoneNumber}:`, history.length, 'mensagens');
}

// Função para obter histórico da conversa
function getConversationHistory(phoneNumber) {
    return conversationMemory.get(phoneNumber) || [];
}

// Função para formatar histórico para o prompt
function formatConversationHistory(phoneNumber) {
    const history = getConversationHistory(phoneNumber);
    if (history.length === 0) {
        return "PRIMEIRA CONVERSA - Sem histórico anterior.";
    }

    let formatted = "HISTÓRICO DA CONVERSA:\n";
    history.forEach((msg, index) => {
        const role = msg.role === 'user' ? 'PROSPECT' : 'SDR';
        formatted += `${index + 1}. ${role}: ${msg.content}\n`;
    });

    return formatted;
}

// Prompt para o SDR Antiplantão
const SDR_PROMPT = `
Você é um SDR humano especialista em quebrar objeções, trabalhando para Gabriel Maia no movimento ANTIPLANTÃO.

CONTEXTO:
- Você ajuda médicos que estão cansados de ganhar pouco e trabalhar demais
- Gabriel Maia ensina médicos a ganharem 6 figuras sem plantões, PSF ou SUS
- Sua ÚNICA meta: agendar uma call de 30 min com Gabriel
- NUNCA mencione valores da mentoria

PERSONALIDADE:
- Consultivo, não vendedor
- Curioso sobre a situação do médico
- Empático com as dores
- Confiante sobre a solução
- Persistente mas respeitoso

ESTRATÉGIA DE CONVERSAÇÃO:
1. DESCUBRA a situação atual (especialidade, renda, dores)
2. IDENTIFIQUE as objeções (tempo, dinheiro, ceticismo)
3. QUEBRE objeções com casos de sucesso
4. DIRECIONE para call: "15 min de conversa pode mudar sua carreira"

QUEBRA DE OBJEÇÕES:
- "Não tenho tempo" → "Exato, por isso Gabriel criou o método. 15 min podem te dar horas livres"
- "Já tentei outras coisas" → "Entendo. Gabriel também tentou mil coisas antes de descobrir isso"
- "Não acredito" → "Normal. Eu também duvidava. Quer ver alguns resultados?"
- "Deve ser caro" → "O que é mais caro: investir na solução ou continuar como está?"

REGRAS:
- SEMPRE dialogue, nunca monologue
- Faça perguntas para entender a situação
- Use o nome da pessoa quando possível
- Seja genuíno, não robótico
- Foque em agendar, não em explicar tudo

Responda como um SDR expert que quer genuinamente ajudar:
`;

// Função do SDR Antiplantão
async function processSDRMessage(messageText, contactName, phoneNumber) {
    try {
        console.log('🤖 Iniciando processamento SDR...');
        console.log('📝 Mensagem recebida:', messageText);
        console.log('👤 Nome do contato:', contactName);
        console.log('📞 Número:', phoneNumber);

        // Adicionar mensagem do usuário ao histórico
        addToConversationMemory(phoneNumber, 'user', messageText);

        // Obter contexto da conversa
        const conversationContext = formatConversationHistory(phoneNumber);
        console.log('📚 Contexto da conversa:', conversationContext);

        const prompt = SDR_PROMPT + `

${conversationContext}

MENSAGEM ATUAL: "${messageText}"
NOME DO CONTATO: ${contactName || 'Não identificado'}

INSTRUÇÕES CONTEXTUAIS:
- Considere TODA a conversa anterior ao responder
- Se já se apresentou, não se apresente novamente
- Se já sabe a especialidade, não pergunte de novo
- Continue naturalmente a partir do que já foi dito
- Responda ESPECIFICAMENTE à mensagem atual considerando o contexto
- SEMPRE conduza para agendar uma call baseado no que já sabe
- Seja natural e humano, mantendo a continuidade da conversa

Responda como um SDR que lembra de toda a conversa:`;

        console.log('🚀 Enviando para Gemini...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        console.log('✅ Resposta do Gemini:', text);

        // Adicionar resposta do SDR ao histórico
        addToConversationMemory(phoneNumber, 'assistant', text);

        return text;
    } catch (error) {
        console.error('❌ Erro no SDR Gemini:', error);
        addNotificationLog('error', 'Erro ao gerar resposta do SDR', { error: error.message });

        // Fallback mais inteligente baseado na mensagem
        if (messageText.toLowerCase().includes('oi') || messageText.toLowerCase().includes('olá')) {
            return `Oi! Tudo bem?

Vi que você entrou em contato. Você é médico?

Pergunto porque trabalho com o Gabriel Maia ajudando médicos que querem sair da correria dos plantões.

Qual sua especialidade?`;
        }

        return `Oi!

Obrigado por entrar em contato. Sou da equipe do Gabriel Maia.

Você é médico? Qual sua especialidade?`;
    }
}

// Session structure: { sock, qrCodeData, isReady, isConnecting, contacts, messagesList, chatMessages, allChats, authDir }

// Create user-specific directories and session data
async function createUserSession(userId) {
    const authDir = path.join(__dirname, 'auth_info_baileys', `user_${userId}`);
    const dataDir = path.join(authDir, 'data');

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const session = {
        userId,
        sock: null,
        qrCodeData: null,
        isReady: false,
        isConnecting: false,
        contacts: [],
        messagesList: [],
        chatMessages: new Map(),
        allChats: [],
        authDir,
        dataDir,
        chatsFile: path.join(dataDir, 'chats.json'),
        messagesFile: path.join(dataDir, 'messages.json'),
        contactsFile: path.join(dataDir, 'contacts.json')
    };

    // Load persisted data for this user
    loadPersistedUserData(session);

    return session;
}

// Session management functions
function getSession(userId) {
    return userSessions.get(userId);
}

function setSession(userId, session) {
    userSessions.set(userId, session);
}

function deleteSession(userId) {
    userSessions.delete(userId);
}

// Persistence functions per user
function saveUserData(session, filePath, data) {
    try {
        if (!fs.existsSync(session.dataDir)) {
            fs.mkdirSync(session.dataDir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ [${session.userId}] Erro ao salvar ${path.basename(filePath)}:`, error);
    }
}

function loadUserData(session, filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`❌ [${session.userId}] Erro ao carregar ${path.basename(filePath)}:`, error);
    }
    return defaultValue;
}

function saveUserChats(session) {
    saveUserData(session, session.chatsFile, session.allChats);
}

function saveUserMessages(session) {
    const messagesObj = {};
    for (const [key, value] of session.chatMessages.entries()) {
        messagesObj[key] = value;
    }
    saveUserData(session, session.messagesFile, messagesObj);
}

function saveUserContacts(session) {
    saveUserData(session, session.contactsFile, session.contacts);
}

function loadPersistedUserData(session) {
    console.log(`📂 [${session.userId}] Carregando dados salvos...`);

    session.allChats = loadUserData(session, session.chatsFile, []);
    console.log(`✅ [${session.userId}] ${session.allChats.length} chats carregados`);

    session.contacts = loadUserData(session, session.contactsFile, []);
    console.log(`✅ [${session.userId}] ${session.contacts.length} contatos carregados`);

    const savedMessages = loadUserData(session, session.messagesFile, {});
    for (const [key, value] of Object.entries(savedMessages)) {
        session.chatMessages.set(key, value);
    }
    console.log(`✅ [${session.userId}] Mensagens de ${Object.keys(savedMessages).length} chats carregados`);
}

// WhatsApp connection per user
async function connectUserToWhatsApp(userId) {
    let session = getSession(userId);
    if (!session) {
        session = await createUserSession(userId);
        setSession(userId, session);
    }

    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[${userId}] Usando WA v${version.join('.')}, é a mais recente: ${isLatest}`);

    session.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: [`WhatsApp API User ${userId}`, 'Chrome', '1.0.0']
    });

    session.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`📱 [${userId}] QR Code recebido`);
            session.isConnecting = true;
            session.isReady = false;

            try {
                session.qrCodeData = await QRCode.toDataURL(qr);
                console.log(`✅ [${userId}] QR Code convertido para imagem`);

                // Send status update to user's SSE clients
                const statusData = await getStatusData(session);
                sendEventToUserClients(userId, 'status', statusData);
            } catch (err) {
                console.error(`❌ [${userId}] Erro ao gerar QR Code:`, err);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ [${userId}] Conexão fechada devido a:`, lastDisconnect?.error);

            session.isReady = false;
            session.isConnecting = false;
            session.qrCodeData = null;

            // Send status update
            const statusData = await getStatusData(session);
            sendEventToUserClients(userId, 'status', statusData);

            if (shouldReconnect) {
                console.log(`🔄 [${userId}] Tentando reconectar...`);
                setTimeout(() => connectUserToWhatsApp(userId), 5000);
            }
        } else if (connection === 'open') {
            console.log(`✅ [${userId}] Conectado ao WhatsApp!`);
            session.isReady = true;
            session.isConnecting = false;
            session.qrCodeData = null;

            // Send status update
            const statusData = await getStatusData(session);
            sendEventToUserClients(userId, 'status', statusData);

            // Initialize user's WhatsApp data
            setTimeout(async () => {
                try {
                    await session.sock.sendMessage(session.sock.user.id, { text: '.' });
                    console.log(`✅ [${userId}] Sincronização inicial enviada`);
                } catch (error) {
                    console.log(`ℹ️ [${userId}] Erro na sincronização:`, error.message);
                }

                await loadAllUserChats(session);
            }, 2000);
        } else if (connection === 'connecting') {
            console.log(`⏳ [${userId}] Conectando...`);
            session.isConnecting = true;

            const statusData = await getStatusData(session);
            sendEventToUserClients(userId, 'status', statusData);
        }
    });

    session.sock.ev.on('creds.update', saveCreds);

    session.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`🔥 [${userId}] EVENTO MESSAGES.UPSERT RECEBIDO!`);
        console.log(`📊 [${userId}] Número de mensagens:`, messages.length);
        console.log(`📊 [${userId}] Type:`, type);

        // Filtrar apenas mensagens novas e reais
        const validMessages = messages.filter(msg => {
            // Ignorar mensagens sem conteúdo
            if (!msg.message) return false;
            // Ignorar apenas status broadcasts
            if (msg.key.remoteJid === 'status@broadcast') return false;
            
            // ⭐ Debug e extração para @lid
            if (msg.key.remoteJid && msg.key.remoteJid.includes('@lid')) {
                console.log(`🔍 [${session.userId}] DEBUG @lid detectado:`, {
                    remoteJid: msg.key.remoteJid,
                    participant: msg.key.participant, // ⭐ ESTA É A CHAVE!
                    pushName: msg.pushName,
                    fromMe: msg.key.fromMe
                });
                
                // ⭐ SOLUÇÃO 1: Verificar participant (principalmente em grupos)
                if (msg.key.participant && msg.key.participant.includes('@s.whatsapp.net')) {
                    const realNumber = msg.key.participant.replace('@s.whatsapp.net', '');
                    console.log(`🎯 [${session.userId}] NÚMERO REAL ENCONTRADO no participant: ${realNumber}`);
                    
                    // Salvar mapeamento no cache
                    lidToPhoneMap.set(msg.key.remoteJid, realNumber);
                    
                    // ⭐ SOLUÇÃO 3: Salvar no BD para próximas vezes
                    saveLidMappingToDatabase(msg.key.remoteJid, realNumber);
                }
            }
            // Ignorar mensagens com problemas de descriptografia
            if (msg.messageStubType) return false;
            return true;
        });

        console.log(`✅ [${userId}] Mensagens válidas:`, validMessages.length);

        if (validMessages.length === 0) {
            console.log(`⚠️ [${userId}] Nenhuma mensagem válida para processar`);
            return;
        }

        const message = validMessages[0];

        console.log(`📋 [${userId}] Message object:`, JSON.stringify(message, null, 2));

        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        console.log(`🔍 [${userId}] Extraindo texto da mensagem...`);
        console.log(`📝 [${userId}] message.conversation:`, message.message.conversation);
        console.log(`📝 [${userId}] message.extendedTextMessage?.text:`, message.message.extendedTextMessage?.text);

        // Tentar extrair texto de diferentes tipos de mensagem
        let messageText = '';
        if (message.message.conversation) {
            messageText = message.message.conversation;
        } else if (message.message.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
        } else if (message.message.imageMessage?.caption) {
            messageText = message.message.imageMessage.caption;
        } else if (message.message.videoMessage?.caption) {
            messageText = message.message.videoMessage.caption;
        }

        console.log(`✅ [${userId}] Texto final extraído: "${messageText}"`);

        if (!messageText) {
            console.log(`⚠️ [${userId}] MENSAGEM SEM TEXTO! Tipos disponíveis:`, Object.keys(message.message));
            return;
        }

        // Filtrar mensagens muito antigas (mais de 1 hora)
        const messageAge = Date.now() - (message.messageTimestamp * 1000);
        if (messageAge > 3600000) { // 1 hora
            console.log(`⏰ [${userId}] Mensagem muito antiga (${Math.round(messageAge/60000)} min), ignorando`);
            return;
        }

        let chatName = message.pushName || chatId;
        if (isGroup) {
            try {
                const groupMetadata = await session.sock.groupMetadata(chatId);
                chatName = groupMetadata.subject || chatName;
            } catch (error) {
                console.log(`❌ [${userId}] Erro ao obter metadata do grupo:`, error);
            }
        }

        const messageObj = {
            id: message.key.id,
            from: message.key.fromMe ? session.sock.user.id : chatId,  // Quem enviou
            to: message.key.fromMe ? chatId : session.sock.user.id,    // Para quem foi enviado
            body: messageText,
            type: 'text',
            timestamp: Date.now(),
            isFromMe: message.key.fromMe,
            contact: {
                id: chatId,
                name: chatName,
                pushname: message.pushName || '',
                number: isGroup ? chatId : cleanPhoneNumber(chatId)
            }
        };

        session.messagesList.unshift(messageObj);
        if (session.messagesList.length > 100) session.messagesList.pop();

        if (!session.chatMessages.has(chatId)) {
            session.chatMessages.set(chatId, []);
        }
        const chatMsgs = session.chatMessages.get(chatId);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop();

        // Auto-add contact for non-group messages
        if (!message.key.fromMe && !isGroup) {
            const existingContact = session.contacts.find(c => c.id === chatId);
            if (!existingContact) {
                const newContact = {
                    id: chatId,
                    name: message.pushName || cleanPhoneNumber(chatId),
                    pushname: message.pushName || '',
                    number: cleanPhoneNumber(chatId),
                    isMyContact: true
                };
                session.contacts.push(newContact);
                console.log(`👤 [${userId}] Novo contato adicionado automaticamente:`, newContact.name);
                saveUserContacts(session);
                sendEventToUserClients(userId, 'contacts_updated', session.contacts);
            }
        }

        // Update or create chat
        const existingChatIndex = session.allChats.findIndex(c => c.id === chatId);
        const chatData = {
            id: chatId,
            name: chatName,
            isGroup: isGroup,
            lastMessage: {
                body: messageText,
                timestamp: Date.now(),
                isFromMe: message.key.fromMe
            },
            unreadCount: message.key.fromMe ? 0 : (existingChatIndex >= 0 ? (session.allChats[existingChatIndex].unreadCount || 0) + 1 : 1),
            timestamp: Date.now()
        };

        if (existingChatIndex >= 0) {
            session.allChats[existingChatIndex] = chatData;
        } else {
            session.allChats.unshift(chatData);
        }

        session.allChats.sort((a, b) => b.timestamp - a.timestamp);

        // Save data
        saveUserMessages(session);
        saveUserChats(session);

        // Verificar se é uma resposta a botão (formato antigo e novo)
        const isButtonResponse = message.message.buttonsResponseMessage || message.message.templateButtonReplyMessage;

        if (isButtonResponse) {
            const buttonId = message.message.buttonsResponseMessage?.selectedButtonId ||
                            message.message.templateButtonReplyMessage?.selectedId;

            console.log(`🔘 [${userId}] Botão clicado: ${buttonId}`);

            // Gerar protocolo único para esta resposta
            const protocol = generateProtocol();
            const participantName = message.pushName || cleanPhoneNumber(chatId);

            // Verificar diferentes tipos de botões
            if (buttonId && buttonId.startsWith('confirm_call_')) {
                const eventId = buttonId.replace('confirm_call_', '');
                console.log(`✅ [${userId}] Confirmação de call recebida para evento: ${eventId}`);

                // Responder com protocolo
                await session.sock.sendMessage(chatId, {
                    text: `✅ Confirmação recebida!\n\n📋 Protocolo: ${protocol}\n\nObrigado por confirmar sua presença.`
                });

                // Encaminhar para admin
                const adminPhone = await getAdminPhone(userId);
                const confirmMessage = `✅ ${participantName} confirmou presença na call (Evento ID: ${eventId})\n📋 Protocolo: ${protocol}`;

                try {
                    await session.sock.sendMessage(adminPhone, { text: confirmMessage });
                    console.log(`📤 [${userId}] Confirmação encaminhada para admin com protocolo: ${protocol}`);
                } catch (error) {
                    console.error(`❌ [${userId}] Erro ao encaminhar confirmação:`, error);
                }

            } else if (buttonId && buttonId.startsWith('confirm_')) {
                // Novos botões de teste
                console.log(`✅ [${userId}] Botão de confirmação clicado: ${buttonId}`);

                // Responder com protocolo
                await session.sock.sendMessage(chatId, {
                    text: `🎯 Ação confirmada!\n\n📋 Protocolo: ${protocol}\n\nSeu clique foi registrado com sucesso.`
                });

                // Encaminhar para admin
                const adminPhone = await getAdminPhone(userId);
                const confirmMessage = `🎯 ${participantName} clicou em "${buttonId}"\n📋 Protocolo: ${protocol}`;

                try {
                    await session.sock.sendMessage(adminPhone, { text: confirmMessage });
                    console.log(`📤 [${userId}] Resposta encaminhada para admin com protocolo: ${protocol}`);
                } catch (error) {
                    console.error(`❌ [${userId}] Erro ao encaminhar resposta:`, error);
                }

            } else if (buttonId && buttonId.startsWith('cancel_')) {
                // Botão de cancelamento
                console.log(`❌ [${userId}] Botão de cancelamento clicado: ${buttonId}`);

                // Responder com protocolo
                await session.sock.sendMessage(chatId, {
                    text: `❌ Ação cancelada.\n\n📋 Protocolo: ${protocol}\n\nSua resposta foi registrada.`
                });
            }

            // Log da resposta
            addNotificationLog('success', `Resposta de botão recebida de ${participantName}`, {
                buttonId,
                protocol,
                participantPhone: chatId,
                participantName
            });
        }

        // Verificar se é mensagem de confirmação (limitado a 2 mensagens por pessoa)
        if (!message.key.fromMe && messageText && messageText.length > 0) {
            const participantName = message.pushName || cleanPhoneNumber(chatId);

            // Verificar se esta pessoa está na lista de confirmações pendentes
            if (pendingConfirmations.has(chatId)) {
                const confirmationData = pendingConfirmations.get(chatId);

                // Verificar se ainda não excedeu o limite de 2 mensagens
                if (confirmationData.count < confirmationData.maxMessages) {
                    confirmationData.count++;

                    const adminPhone = await getAdminPhone(userId);
                    let adminMessage;

                    // Verificar se a resposta é "OK" (confirmação)
                    if (messageText.toLowerCase().trim() === 'ok') {
                        adminMessage = `✅ A call de ${confirmationData.eventTime} está confirmada.\n👤 ${participantName}`;
                        console.log(`✅ [${userId}] Confirmação OK recebida de ${participantName}`);
                    } else {
                        adminMessage = `💬 A call de ${confirmationData.eventTime} disse: "${messageText}"\n👤 ${participantName}`;
                        console.log(`💬 [${userId}] Resposta personalizada de ${participantName}: ${messageText}`);
                    }

                    // Enviar para admin
                    try {
                        await session.sock.sendMessage(adminPhone, { text: adminMessage });
                        console.log(`📤 [${userId}] Resposta encaminhada para admin (${confirmationData.count}/${confirmationData.maxMessages})`);

                        addNotificationLog('info', `Resposta de confirmação ${confirmationData.count}/${confirmationData.maxMessages}`, {
                            participantPhone: chatId,
                            participantName,
                            message: messageText,
                            isConfirmation: messageText.toLowerCase().trim() === 'ok'
                        });
                    } catch (error) {
                        console.error(`❌ [${userId}] Erro ao encaminhar para admin:`, error);
                    }

                    // Se atingiu o limite, remover da lista
                    if (confirmationData.count >= confirmationData.maxMessages) {
                        pendingConfirmations.delete(chatId);
                        console.log(`🔒 [${userId}] Limite de mensagens atingido para ${participantName}. Removido da lista.`);
                    }
                } else {
                    console.log(`⏭️ [${userId}] Ignorando mensagem de ${participantName} - limite excedido`);
                }
            } else {
                // Pessoa não está na lista de confirmações pendentes - ignorar
                console.log(`⏭️ [${userId}] Ignorando mensagem de ${participantName} - não está aguardando confirmação`);
            }
        }

        // Send events to user's clients
        sendEventToUserClients(userId, 'new_message', messageObj);
        sendEventToUserClients(userId, 'chats_updated', session.allChats);
        sendEventToUserClients(userId, 'chat_message_update', {
            chatId: chatId,
            message: messageObj
        });

        // Log all messages
        const groupInfo = isGroup ? ` no grupo "${chatName}"` : '';
        const messageType = message.key.fromMe ? "ENVIADA" : "RECEBIDA";
        console.log(`📨 [${userId}] MENSAGEM ${messageType}${groupInfo}: ${messageText}`);

        // SDR ANTIPLANTÃO - DESATIVADO
        if (false && !message.key.fromMe && messageText && messageText.length > 0 && !isGroup) {
            const cleanPhone = cleanPhoneNumber(chatId).replace('+', '');
            console.log(`🔍 [${userId}] DEBUG SDR:`);
            console.log(`   - chatId original: ${chatId}`);
            console.log(`   - cleanPhone: "${cleanPhone}"`);
            console.log(`   - targetPhone: "${targetPhone}"`);
            console.log(`   - São iguais? ${cleanPhone === targetPhone}`);
            console.log(`   - Tipo cleanPhone: ${typeof cleanPhone}`);
            console.log(`   - Tipo targetPhone: ${typeof targetPhone}`);

            if (cleanPhone === targetPhone) {
                console.log(`🎯 [${userId}] MENSAGEM DO NÚMERO ALVO! Ativando SDR...`);

                try {
                    const contactName = message.pushName || 'Prospect';

                    console.log(`👤 [${userId}] Processando mensagem para: ${contactName}`);
                    console.log(`💬 [${userId}] Mensagem: "${messageText}"`);

                    // Gerar resposta com Gemini SDR
                    const sdrResponse = await processSDRMessage(messageText, contactName, cleanPhone);

                    console.log(`🤖 [${userId}] Resposta do SDR: "${sdrResponse}"`);

                    // Enviar resposta
                    await session.sock.sendMessage(chatId, { text: sdrResponse });
                    console.log(`✅ [${userId}] Resposta SDR enviada!`);

                    // Notificar admin sobre a interação
                    const adminPhone = await getAdminPhone(userId);
                    const adminNotification = `🚀 SDR ANTIPLANTÃO ativo!\n\n👤 Prospect: ${contactName}\n📞 ${cleanPhone}\n💬 Perguntou: "${messageText}"\n🤖 Respondi: "${sdrResponse}"`;

                    try {
                        await session.sock.sendMessage(adminPhone, { text: adminNotification });
                        console.log(`📤 [${userId}] Notificação enviada para admin`);
                    } catch (notifyError) {
                        console.error(`❌ [${userId}] Erro ao notificar admin:`, notifyError);
                    }

                    // Log da interação SDR
                    addNotificationLog('success', `SDR respondeu para ${contactName}`, {
                        participantPhone: cleanPhone,
                        participantName: contactName,
                        question: messageText,
                        response: sdrResponse
                    });

                } catch (error) {
                    console.error(`❌ [${userId}] Erro no SDR:`, error);

                    // Resposta de fallback
                    const fallbackMessage = `Oi! Tudo bem?

Eu sou da equipe do Gabriel Maia, vi que você pode estar interessado no movimento antiplantão.

Você é médico? Se for, posso te contar algo que pode interessar...

Qual sua especialidade?`;

                    try {
                        await session.sock.sendMessage(chatId, { text: fallbackMessage });
                        console.log(`✅ [${userId}] Resposta de fallback enviada!`);
                    } catch (fallbackError) {
                        console.error(`❌ [${userId}] Erro ao enviar fallback:`, fallbackError);
                    }

                    addNotificationLog('error', 'Erro no SDR - enviada resposta de fallback', {
                        participantPhone: cleanPhone,
                        error: error.message
                    });
                }
            }
        }

        // Automação Bereanos (funciona para qualquer mensagem)
        console.log(`🔍 [${userId}] Verificando mensagem: "${messageText}"`);
        if (messageText.toLowerCase().includes('bereanos')) {
                console.log(`🎯 [${userId}] TRIGGER DETECTADO! Enviando Palavra Bereanos...`);
                try {
                    const fs = require('fs');
                    const path = require('path');

                    // Carregar palavras
                    const palavrasPath = path.join(__dirname, 'palavra-bereanos.json');
                    console.log(`📁 [${userId}] Carregando arquivo: ${palavrasPath}`);

                    const palavras = JSON.parse(fs.readFileSync(palavrasPath, 'utf8'));
                    console.log(`📊 [${userId}] ${palavras.length} palavras carregadas`);

                    // Escolher palavra aleatória
                    const randomIndex = Math.floor(Math.random() * palavras.length);
                    const palavraAleatoria = palavras[randomIndex];
                    console.log(`🎲 [${userId}] Palavra escolhida (#${randomIndex}): ${palavraAleatoria.titulo}`);

                    // Formatar mensagem
                    const mensagemCompleta = `🙏 *${palavraAleatoria.titulo}*\n\n📖 *${palavraAleatoria.versiculo}*\n\n💭 ${palavraAleatoria.mensagem}\n\n🙌 *Oração:*\n${palavraAleatoria.oracao}`;

                    await session.sock.sendMessage(message.key.remoteJid, { text: mensagemCompleta });
                    console.log(`✅ [${userId}] Palavra Bereanos enviada com sucesso!`);
                } catch (error) {
                    console.error(`❌ [${userId}] Erro ao enviar Palavra Bereanos:`, error);
                    console.error(`❌ [${userId}] Stack trace:`, error.stack);
                }
        }

        // Comando agenda direto
        if (messageText.toLowerCase().trim() === 'agenda') {
            try {
                console.log(`📅 [${userId}] Comando agenda detectado...`);
                
                const organization = await getUserOrganization(chatId);
                
                if (!organization) {
                    await session.sock.sendMessage(chatId, { 
                        text: '❌ Você não faz parte de uma organização autorizada para usar este comando.' 
                    });
                    return;
                }

                console.log('🏢 Organização encontrada:', {
                    id: organization.id,
                    name: organization.name,
                    admin_phone: organization.admin_phone
                });

                const events = await getEventsForOrganization(organization.id);
                console.log('📅 Retorno dos eventos:', events?.length || 0, 'eventos');
                let response = '';

                if (!events || events.length === 0) {
                    response = `📅 *Programação do dia* (${new Date().toLocaleDateString('pt-BR')})\n\n✅ Nenhum compromisso agendado para hoje.`;
                } else {
                    response = `📅 *Programação do dia* (${new Date().toLocaleDateString('pt-BR')})\n\n`;
                    
                    events.forEach((event, index) => {
                        const eventStart = new Date(event.start_datetime);
                        const eventEnd = new Date(event.end_datetime);
                        const timeStartStr = eventStart.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Sao_Paulo'
                        });
                        const timeEndStr = eventEnd.toLocaleTimeString('pt-BR', {
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
                        
                        response += `${index + 1}. ${timeStartStr}-${timeEndStr} - ${event.title}\n`;
                        response += `   👤 ${participantName}\n\n`;
                    });
                }

                await session.sock.sendMessage(chatId, { text: response });
                console.log(`✅ [${userId}] Programação do dia enviada!`);
            } catch (error) {
                console.error(`❌ [${userId}] Erro ao enviar programação:`, error);
            }
        }

        // Remover lógica de keywords
        else if (false) {
            try {
                console.log(`📅 [${userId}] Pergunta sobre agenda detectada, enviando opções...`);

                const responseMessage = `📅 *Informações dos Compromissos*

Qual informação você gostaria de saber sobre as reuniões?

🕐 *1* - Horários das reuniões
👥 *2* - Participantes
🔗 *3* - Links de acesso
📋 *4* - Programação completa do dia
📍 *5* - Locais das reuniões
⏰ *6* - Próxima reunião

_Digite o número da opção desejada ou digite sua pergunta específica._`;

                await session.sock.sendMessage(message.key.remoteJid, { text: responseMessage });
                console.log(`✅ [${userId}] Menu de agenda enviado!`);
            } catch (error) {
                console.error(`❌ [${userId}] Erro ao enviar menu de agenda:`, error);
            }
        }

        // Comando faturamento (apenas em conversa privada)
        else if (messageText.toLowerCase().trim() === 'faturamento') {
            try {
                // Verificar se é conversa privada (não é grupo)
                if (chatId.includes('@g.us')) {
                    await session.sock.sendMessage(chatId, { 
                        text: '🔒 Este comando só funciona em conversa privada por questões de segurança.' 
                    });
                    return;
                }

                console.log(`💰 [${userId}] Comando faturamento detectado...`);
                
                const organization = await getUserOrganization(chatId);
                
                if (!organization) {
                    await session.sock.sendMessage(chatId, { 
                        text: '❌ Você não faz parte de uma organização autorizada para usar este comando.' 
                    });
                    return;
                }

                console.log('🏢 Organização encontrada para faturamento:', {
                    id: organization.id,
                    name: organization.name
                });

                const faturamento = await getFaturamentoForOrganization(organization.id);

                let response = `💰 *FATURAMENTO DE ${faturamento.mesAno}*\n\n`;
                response += `📅 *Período:* ${faturamento.periodo}\n\n`;
                
                response += `📊 *RECEITA DO MÊS:*\n`;
                response += `💵 Total Faturado: R$ ${faturamento.totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                response += `📈 Total de ${faturamento.vendas.length} venda(s)\n\n`;

                if (faturamento.vendas && faturamento.vendas.length > 0) {
                    response += `📋 *DETALHAMENTO DAS VENDAS:*\n\n`;
                    
                    faturamento.vendas.slice(0, 10).forEach((venda, index) => {
                        const dataVenda = new Date(venda.data_venda).toLocaleDateString('pt-BR');
                        const cliente = venda.nome_completo || 'Cliente não identificado';
                        const valor = venda.valor_vendido || 0;
                        
                        response += `${index + 1}. 💰 R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                        response += `   👤 ${cliente}\n`;
                        response += `   📅 ${dataVenda}\n\n`;
                    });

                    if (faturamento.vendas.length > 10) {
                        response += `... e mais ${faturamento.vendas.length - 10} vendas\n`;
                    }
                } else {
                    response += '📝 Nenhuma venda registrada este mês.';
                }

                await session.sock.sendMessage(chatId, { text: response });
                console.log(`✅ [${userId}] Faturamento enviado!`);
            } catch (error) {
                console.error(`❌ [${userId}] Erro ao processar faturamento:`, error);
                await session.sock.sendMessage(chatId, { 
                    text: '❌ Erro ao buscar faturamento. Tente novamente.' 
                });
            }
        }

        // Comando pendencias/pendencia (apenas em conversa privada)
        else if (['pendencia', 'pendencias'].includes(messageText.toLowerCase().trim())) {
            try {
                // Verificar se é conversa privada (não é grupo)
                if (chatId.includes('@g.us')) {
                    await session.sock.sendMessage(chatId, { 
                        text: '🔒 Este comando só funciona em conversa privada por questões de segurança.' 
                    });
                    return;
                }

                console.log(`⚠️ [${userId}] Comando pendências detectado...`);
                
                const organization = await getUserOrganization(chatId);
                
                if (!organization) {
                    await session.sock.sendMessage(chatId, { 
                        text: '❌ Você não faz parte de uma organização autorizada para usar este comando.' 
                    });
                    return;
                }

                console.log('🏢 Organização encontrada para pendências:', {
                    id: organization.id,
                    name: organization.name
                });

                const pendencias = await getPendenciasForOrganization(organization.id);

                if (!pendencias || pendencias.length === 0) {
                    await session.sock.sendMessage(chatId, { 
                        text: '✅ *PENDÊNCIAS FINANCEIRAS*\n\nNenhuma pendência encontrada! 🎉\nTodos os pagamentos estão em dia.' 
                    });
                    return;
                }

                const totalPendente = pendencias.reduce((sum, divida) => sum + (divida.valor || 0), 0);

                let response = `⚠️ *PENDÊNCIAS FINANCEIRAS*\n\n`;
                response += `💰 *Total em Aberto: R$ ${totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
                response += `📊 Total de ${pendencias.length} pendência(s)\n\n`;

                response += `📋 *DETALHAMENTO:*\n\n`;

                pendencias.forEach((divida, index) => {
                    const valor = divida.valor || 0;
                    const status = divida.status || 'pendente';
                    const dataVencimento = divida.data_vencimento ? new Date(divida.data_vencimento) : null;
                    const hoje = new Date();
                    
                    let statusIcon = '🟡';
                    let statusText = 'Pendente';
                    
                    if (status === 'atrasado') {
                        statusIcon = '🔴';
                        statusText = 'Atrasado';
                        
                        if (dataVencimento) {
                            const diasAtraso = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
                            statusText = `Atrasado há ${diasAtraso} dias`;
                        }
                    } else if (dataVencimento) {
                        const diasParaVencer = Math.floor((dataVencimento - hoje) / (1000 * 60 * 60 * 24));
                        if (diasParaVencer <= 7 && diasParaVencer > 0) {
                            statusIcon = '🟠';
                            statusText = `Vence em ${diasParaVencer} dias`;
                        } else if (diasParaVencer <= 0) {
                            statusIcon = '🔴';
                            statusText = 'Vencido';
                        }
                    }
                    
                    const mentorado = divida.mentorado_nome || 'Mentorado não identificado';
                    
                    response += `${index + 1}. ${statusIcon} R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                    response += `   👤 ${mentorado}\n`;
                    response += `   📊 Status: ${statusText}\n`;
                    
                    if (dataVencimento) {
                        response += `   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}\n`;
                    }
                    
                    if (divida.descricao) {
                        response += `   📝 ${divida.descricao}\n`;
                    }
                    
                    response += '\n';
                });

                await session.sock.sendMessage(chatId, { text: response });
                console.log(`✅ [${userId}] Pendências enviadas!`);
            } catch (error) {
                console.error(`❌ [${userId}] Erro ao processar pendências:`, error);
                await session.sock.sendMessage(chatId, { 
                    text: '❌ Erro ao buscar pendências. Tente novamente.' 
                });
            }
        }

        // Manter ping/pong para testes
        else if (messageText.toLowerCase().includes('ping')) {
            try {
                await session.sock.sendMessage(message.key.remoteJid, { text: 'pong' });
                console.log(`✅ [${userId}] Pong enviado!`);
            } catch (error) {
                console.error(`❌ [${userId}] Erro ao enviar pong:`, error);
            }
        }
    });

    setSession(userId, session);
}

// Load all chats for a user
async function loadAllUserChats(session) {
    try {
        if (!session.sock || !session.isReady) return;

        console.log(`💬 [${session.userId}] Carregando todos os chats...`);
        session.allChats = [];

        const store = session.sock.store;
        if (store && store.chats) {
            const chatEntries = Object.entries(store.chats);
            console.log(`📱 [${session.userId}] ${chatEntries.length} chats encontrados no store`);

            for (const [chatId, chatData] of chatEntries) {
                if (chatId.includes('@s.whatsapp.net') || chatId.includes('@g.us')) {
                    if (chatId === 'status@broadcast') continue;

                    const lastMessage = session.messagesList.find(msg =>
                        msg.from === chatId || msg.to === chatId
                    );

                    const chat = {
                        id: chatId,
                        name: chatData.name || cleanPhoneNumber(chatId),
                        isGroup: chatId.includes('@g.us'),
                        lastMessage: lastMessage ? {
                            body: lastMessage.body,
                            timestamp: lastMessage.timestamp,
                            isFromMe: lastMessage.isFromMe
                        } : null,
                        unreadCount: chatData.unreadCount || 0,
                        timestamp: lastMessage?.timestamp || Date.now()
                    };

                    session.allChats.push(chat);
                }
            }
        }

        const uniqueChats = new Map();
        session.allChats.forEach(chat => uniqueChats.set(chat.id, chat));

        session.messagesList.forEach(message => {
            const chatId = message.from;
            if (!uniqueChats.has(chatId) && chatId !== 'status@broadcast') {
                const chat = {
                    id: chatId,
                    name: message.contact?.name || message.contact?.pushname || cleanPhoneNumber(chatId),
                    isGroup: chatId.includes('@g.us'),
                    lastMessage: {
                        body: message.body,
                        timestamp: message.timestamp,
                        isFromMe: message.isFromMe
                    },
                    unreadCount: 0,
                    timestamp: message.timestamp
                };
                uniqueChats.set(chatId, chat);
            }
        });

        session.allChats = Array.from(uniqueChats.values()).sort((a, b) =>
            (b.lastMessage?.timestamp || b.timestamp) - (a.lastMessage?.timestamp || a.timestamp)
        );

        console.log(`✅ [${session.userId}] ${session.allChats.length} chats carregados e ordenados`);

    } catch (error) {
        console.error(`❌ [${session.userId}] Erro ao carregar chats:`, error);
    }
}

// Load chat history for a user
async function loadUserChatHistory(session, chatId, limit = 5) {
    try {
        if (!session.sock || !session.isReady) return [];

        console.log(`📖 [${session.userId}] Carregando histórico do chat: ${chatId}`);

        let messages = session.chatMessages.get(chatId) || [];

        if (messages.length < limit) {
            const store = session.sock.store;
            if (store && store.messages && store.messages[chatId]) {
                const storeMessages = Object.values(store.messages[chatId]);
                storeMessages.forEach(msg => {
                    if (msg.message && !msg.key.remoteJid?.includes('status@broadcast')) {
                        const messageText = msg.message.conversation ||
                                          msg.message.extendedTextMessage?.text ||
                                          msg.message.imageMessage?.caption ||
                                          '[Mídia]';

                        const messageObj = {
                            id: msg.key.id,
                            from: msg.key.remoteJid,
                            to: msg.key.remoteJid,
                            body: messageText,
                            type: 'text',
                            timestamp: msg.messageTimestamp * 1000 || Date.now(),
                            isFromMe: msg.key.fromMe,
                            contact: {
                                id: msg.key.remoteJid,
                                name: msg.pushName || msg.key.remoteJid,
                                pushname: msg.pushName || '',
                                number: cleanPhoneNumber(msg.key.remoteJid) || ''
                            }
                        };

                        messages.push(messageObj);
                    }
                });

                const uniqueMessages = new Map();
                messages.forEach(msg => uniqueMessages.set(msg.id, msg));
                messages = Array.from(uniqueMessages.values())
                    .sort((a, b) => b.timestamp - a.timestamp);

                session.chatMessages.set(chatId, messages);
            }
        }

        return messages.slice(0, limit);

    } catch (error) {
        console.error(`❌ [${session.userId}] Erro ao carregar histórico do chat ${chatId}:`, error);
        return [];
    }
}

// SSE functions per user
function sendEventToUserClients(userId, eventType, data) {
    const clients = userSSEClients.get(userId);
    if (!clients) return;

    const message = `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
    clients.forEach(client => {
        try {
            client.write(message);
        } catch (error) {
            clients.delete(client);
        }
    });
}

function addSSEClient(userId, res) {
    if (!userSSEClients.has(userId)) {
        userSSEClients.set(userId, new Set());
    }
    userSSEClients.get(userId).add(res);
}

function removeSSEClient(userId, res) {
    const clients = userSSEClients.get(userId);
    if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
            userSSEClients.delete(userId);
        }
    }
}

// ================ ROUTES ================

// User-specific SSE endpoint
app.get('/users/:userId/events', (req, res) => {
    const { userId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // 'Access-Control-Allow-Origin': '*', // Comentado - nginx gerencia CORS
        // 'Access-Control-Allow-Headers': 'Cache-Control' // Comentado - nginx gerencia CORS
    });

    addSSEClient(userId, res);
    console.log(`📡 [${userId}] Novo cliente SSE conectado`);

    // Send initial status
    const session = getSession(userId);
    const initialData = {
        type: 'status',
        data: {
            isReady: session?.isReady || false,
            isConnecting: session?.isConnecting || false,
            hasQR: session?.qrCodeData !== null,
            contactsCount: session?.contacts.length || 0,
            messagesCount: session?.messagesList.length || 0
        }
    };
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    req.on('close', () => {
        removeSSEClient(userId, res);
        console.log(`📡 [${userId}] Cliente SSE desconectado`);
    });
});

// Get current user info from WhatsApp session
async function getUserInfoFromSession(session) {
    if (!session || !session.sock || !session.isReady) {
        return null;
    }

    try {
        const userInfo = session.sock.user;
        if (userInfo) {
            return {
                id: userInfo.id,
                name: userInfo.name || userInfo.notify || 'Usuário',
                phone: userInfo.id.split('@')[0],
                isConnected: true
            };
        }
    } catch (error) {
        console.error(`❌ [${session.userId}] Erro ao obter info do usuário:`, error);
    }
    return null;
}

// Get status data with user info
async function getStatusData(session) {
    const userInfo = await getUserInfoFromSession(session);
    return {
        isReady: session.isReady,
        isConnecting: session.isConnecting,
        hasQR: session.qrCodeData !== null,
        contactsCount: session.contacts.length,
        messagesCount: session.messagesList.length,
        userInfo: userInfo
    };
}

// User registration endpoint
app.post('/users/:userId/register', async (req, res) => {
    const { userId } = req.params;

    try {
        let session = getSession(userId);
        if (session && session.isReady) {
            const userInfo = await getUserInfoFromSession(session);
            return res.json({
                success: false,
                error: 'Usuário já possui WhatsApp conectado',
                userInfo: userInfo
            });
        }

        console.log(`🚀 [${userId}] Registrando novo usuário WhatsApp...`);
        await connectUserToWhatsApp(userId);

        res.json({
            success: true,
            message: 'Processo de registro iniciado. Aguarde o QR Code.',
            userId: userId
        });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao registrar usuário:`, error);
        res.json({
            success: false,
            error: 'Erro ao inicializar WhatsApp para o usuário'
        });
    }
});

// User-specific status
app.get('/users/:userId/status', async (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);

    if (!session) {
        return res.json({
            success: true,
            data: {
                isReady: false,
                isConnecting: false,
                hasQR: false,
                contactsCount: 0,
                messagesCount: 0,
                registered: false,
                userInfo: null
            }
        });
    }

    const userInfo = await getUserInfoFromSession(session);

    res.json({
        success: true,
        data: {
            isReady: session.isReady,
            isConnecting: session.isConnecting,
            hasQR: session.qrCodeData !== null,
            contactsCount: session.contacts.length,
            messagesCount: session.messagesList.length,
            registered: true,
            userInfo: userInfo
        }
    });
});

// User-specific QR code
app.get('/users/:userId/qr', (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);

    if (!session || !session.qrCodeData) {
        return res.json({
            success: false,
            error: session?.isReady ? 'Cliente já conectado' : 'QR Code não disponível'
        });
    }

    res.json({
        success: true,
        data: {
            qr: session.qrCodeData,
            qrImage: session.qrCodeData
        }
    });
});

// User-specific send message
app.post('/users/:userId/send', async (req, res) => {
    const { userId } = req.params;
    const { to, phoneNumber, message } = req.body;
    const targetNumber = to || phoneNumber;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({
            success: false,
            error: 'WhatsApp não está conectado para este usuário'
        });
    }

    try {
        // Resolver @lid primeiro se necessário
        const cleanedNumber = await cleanPhoneNumber(targetNumber, null, session);
        let jid = cleanedNumber.includes('@') ? cleanedNumber : `${cleanedNumber}@s.whatsapp.net`;

        // Se message é um objeto (com botões), usar diretamente
        // Se é string, converter para objeto de texto
        let messageContent;
        if (typeof message === 'object' && message !== null) {
            messageContent = message;
        } else {
            messageContent = { text: message };
        }

        const sentMessage = await session.sock.sendMessage(jid, messageContent);

        // Create message object for sent message
        const messageText = typeof message === 'string' ? message : (message.text || '[Mensagem com botões]');
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,  // Quem enviou (eu)
            to: jid,                     // Para quem foi enviado
            body: messageText,
            type: 'text',
            timestamp: Date.now(),
            isFromMe: true,
            contact: {
                id: jid,
                name: jid.replace('@s.whatsapp.net', ''),
                pushname: '',
                number: jid.replace('@s.whatsapp.net', '')
            }
        };

        // Add to session data
        session.messagesList.unshift(messageObj);
        if (session.messagesList.length > 100) session.messagesList.pop();

        // Add to chat messages
        if (!session.chatMessages.has(jid)) {
            session.chatMessages.set(jid, []);
        }
        const chatMsgs = session.chatMessages.get(jid);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop();

        // Update chat list
        const existingChatIndex = session.allChats.findIndex(c => c.id === jid);
        const chatData = {
            id: jid,
            name: jid.replace('@s.whatsapp.net', ''),
            isGroup: jid.includes('@g.us'),
            lastMessage: {
                body: message,
                timestamp: Date.now(),
                isFromMe: true
            },
            unreadCount: 0,
            timestamp: Date.now()
        };

        if (existingChatIndex >= 0) {
            session.allChats[existingChatIndex] = chatData;
        } else {
            session.allChats.unshift(chatData);
        }

        session.allChats.sort((a, b) => b.timestamp - a.timestamp);

        // Save data
        saveUserMessages(session);
        saveUserChats(session);

        // Send events to update UI
        sendEventToUserClients(userId, 'new_message', messageObj);
        sendEventToUserClients(userId, 'chats_updated', session.allChats);
        sendEventToUserClients(userId, 'chat_message_update', {
            chatId: jid,
            message: messageObj
        });

        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao enviar mensagem:`, error);
        res.json({ success: false, error: 'Erro ao enviar mensagem' });
    }
});

// User-specific messages
app.get('/users/:userId/messages', (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);
    const limit = parseInt(req.query.limit) || 20;

    if (!session) {
        return res.json({ success: true, data: [] });
    }

    const limitedMessages = session.messagesList.slice(0, limit);
    res.json({ success: true, data: limitedMessages });
});

// User-specific contacts
app.get('/users/:userId/contacts', (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);

    if (!session) {
        return res.json({ success: true, data: [] });
    }

    res.json({ success: true, data: session.contacts });
});

// User-specific chats
app.get('/users/:userId/chats', (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);

    if (!session) {
        return res.json({ success: true, data: [], count: 0 });
    }

    res.json({
        success: true,
        data: session.allChats,
        count: session.allChats.length
    });
});

// User-specific chat history
app.get('/users/:userId/chats/:chatId/history', async (req, res) => {
    const { userId, chatId } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({
            success: false,
            error: 'WhatsApp não está conectado para este usuário'
        });
    }

    try {
        const history = await loadUserChatHistory(session, decodeURIComponent(chatId), limit);
        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao carregar histórico do chat ${chatId}:`, error);
        res.json({ success: false, error: 'Erro ao carregar histórico do chat' });
    }
});

// User-specific chat messages
app.get('/users/:userId/messages/:chatId', (req, res) => {
    const { userId, chatId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const session = getSession(userId);

    if (!session) {
        return res.json({ success: true, data: [] });
    }

    console.log(`📨 [${userId}] Buscando mensagens para chat: ${chatId}`);

    // Buscar mensagens específicas do chat
    const chatMsgs = session.chatMessages.get(chatId) || [];

    // FILTRO ADICIONAL: Garantir que as mensagens pertencem ao chat correto
    const filteredMessages = chatMsgs.filter(message => {
        // Para mensagens que eu enviei: verificar se o 'to' é o chat atual
        // Para mensagens que eu recebi: verificar se o 'from' é o chat atual
        const belongsToChat = (message.isFromMe && message.to === chatId) ||
                             (!message.isFromMe && message.from === chatId);

        if (!belongsToChat) {
            console.log(`🚫 [${userId}] Mensagem filtrada - não pertence ao chat ${chatId}:`, {
                id: message.id?.slice(-4),
                from: message.from?.slice(-4),
                to: message.to?.slice(-4),
                isFromMe: message.isFromMe,
                body: message.body?.substring(0, 30)
            });
        }

        return belongsToChat;
    });

    const limitedChatMessages = filteredMessages.slice(0, limit);

    console.log(`✅ [${userId}] Retornando ${limitedChatMessages.length} mensagens para ${chatId} (${chatMsgs.length} total, ${filteredMessages.length} filtradas)`);

    res.json({
        success: true,
        data: limitedChatMessages
    });
});

// Clear corrupted messages data
app.post('/users/:userId/clear-messages', async (req, res) => {
    const { userId } = req.params;
    const session = getSession(userId);

    if (!session) {
        return res.json({ success: false, error: 'Sessão não encontrada' });
    }

    try {
        console.log(`🧹 [${userId}] Limpando dados de mensagens corrompidos...`);

        // Limpar mensagens em memória
        session.messagesList = [];
        session.chatMessages.clear();

        // Limpar arquivos de mensagens
        if (fs.existsSync(session.messagesFile)) {
            fs.unlinkSync(session.messagesFile);
            console.log(`🗑️ [${userId}] Arquivo de mensagens removido`);
        }

        // Salvar dados limpos
        saveUserMessages(session);

        console.log(`✅ [${userId}] Dados de mensagens limpos com sucesso`);
        res.json({ success: true, message: 'Dados de mensagens limpos' });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao limpar mensagens:`, error);
        res.json({ success: false, error: 'Erro ao limpar mensagens' });
    }
});

// Sync specific chat (force refresh a single conversation)
app.post('/users/:userId/chats/:chatId/sync', async (req, res) => {
    const { userId, chatId } = req.params;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({
            success: false,
            error: 'WhatsApp não está conectado para este usuário'
        });
    }

    try {
        const decodedChatId = decodeURIComponent(chatId);
        console.log(`🔄 [${userId}] Sincronizando chat específico: ${decodedChatId}`);

        // Força reload das mensagens do chat específico
        const history = await loadUserChatHistory(session, decodedChatId, 50);

        // Atualizar cache de mensagens do chat
        session.chatMessages.set(decodedChatId, history);

        // Salvar dados atualizados
        saveUserMessages(session);

        // Notificar clientes SSE sobre a atualização
        const sseClients = userSSEClients.get(userId);
        if (sseClients && sseClients.size > 0) {
            const notificationData = {
                type: 'chat_updated',
                data: {
                    chatId: decodedChatId,
                    messageCount: history.length
                }
            };

            sseClients.forEach(client => {
                try {
                    client.write(`data: ${JSON.stringify(notificationData)}\n\n`);
                } catch (error) {
                    console.error(`❌ Erro ao enviar notificação SSE:`, error);
                }
            });
        }

        console.log(`✅ [${userId}] Chat ${decodedChatId} sincronizado com ${history.length} mensagens`);

        res.json({
            success: true,
            message: 'Chat sincronizado com sucesso',
            data: {
                chatId: decodedChatId,
                messageCount: history.length,
                messages: history
            }
        });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao sincronizar chat ${chatId}:`, error);
        res.json({
            success: false,
            error: 'Erro ao sincronizar chat'
        });
    }
});

// Reset user session (clear corrupted data)
app.delete('/users/:userId/reset', async (req, res) => {
    const { userId } = req.params;

    try {
        console.log(`🔄 [${userId}] Resetando sessão...`);

        // Stop existing session
        const existingSession = getSession(userId);
        if (existingSession && existingSession.sock) {
            existingSession.sock.end();
        }

        // Remove from memory
        deleteSession(userId);

        // Clean auth files
        const authDir = path.join(__dirname, 'auth_info_baileys', `user_${userId}`);
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log(`🧹 [${userId}] Arquivos de autenticação removidos`);
        }

        console.log(`✅ [${userId}] Sessão resetada com sucesso`);
        res.json({
            success: true,
            message: 'Sessão resetada. Registre novamente para obter novo QR Code.',
            userId: userId
        });

    } catch (error) {
        console.error(`❌ [${userId}] Erro ao resetar sessão:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// List all registered users
app.get('/users', async (req, res) => {
    const users = await Promise.all(Array.from(userSessions.keys()).map(async userId => {
        const session = userSessions.get(userId);
        const userInfo = await getUserInfoFromSession(session);
        return {
            userId: userId,
            isReady: session.isReady,
            isConnecting: session.isConnecting,
            hasQR: session.qrCodeData !== null,
            contactsCount: session.contacts.length,
            messagesCount: session.messagesList.length,
            chatsCount: session.allChats.length,
            userInfo: userInfo
        };
    }));

    res.json({
        success: true,
        data: users,
        count: users.length
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp Multi-User Baileys API is runningggggg',
        activeUsers: userSessions.size,
        endpoints: {
            register: '/users/default/register',
            status: '/users/default/status',
            send: '/users/default/send',
            qr: '/users/default/qr'
        }
    });
});

// Quick register endpoint for default user (convenience route)
app.post('/register', async (req, res) => {
    console.log('🚀 [CONVENIENCE] Registrando usuário default via /register...');
    req.params = { userId: 'default' };
    return app._router.handle(req, res, () => {});
});

// ================ LEGACY ROUTES FOR BACKWARD COMPATIBILITY ================

// Default user endpoints (for backward compatibility)
app.get('/status', async (req, res) => {
    // Default to user "default" for backward compatibility
    const session = getSession('default');
    if (!session) {
        return res.json({
            success: true,
            data: {
                isReady: false,
                isConnecting: false,
                hasQR: false,
                contactsCount: 0,
                messagesCount: 0,
                userInfo: null
            }
        });
    }

    const statusData = await getStatusData(session);
    res.json({
        success: true,
        data: statusData
    });
});

app.get('/events', (req, res) => {
    // Redirect to default user events
    req.params = { userId: 'default' };
    return app._router.handle(req, res, () => {});
});

// Home page
app.get('/', (req, res) => {
    const userCount = userSessions.size;
    const readyCount = Array.from(userSessions.values()).filter(s => s.isReady).length;

    res.send(`
        <html>
            <head><title>WhatsApp Multi-User Baileys API</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>🚀 WhatsApp Multi-User API 1.0</h1>
                <p><strong>Suporte a múltiplos usuários com Baileys!</strong></p>
                <div style="background: #f5f5f5; padding: 20px; margin: 20px auto; max-width: 600px; border-radius: 10px;">
                    <h3>📊 Status do Sistema</h3>
                    <p>👥 Usuários registrados: <strong>${userCount}</strong></p>
                    <p>✅ Usuários conectados: <strong>${readyCount}</strong></p>
                </div>
                <div style="text-align: left; max-width: 800px; margin: 0 auto;">
                    <h3>🔧 API Endpoints</h3>

                    <div style="background: #e8f5e8; padding: 15px; margin: 10px 0; border-radius: 5px;">
                        <h4>⚡ Endpoints Principais (Usuário Default):</h4>
                        <ul>
                            <li><strong>POST /users/default/register</strong> - Registrar usuário padrão</li>
                            <li><strong>GET /users/default/status</strong> - Status da conexão</li>
                            <li><strong>GET /users/default/qr</strong> - QR Code para conectar</li>
                            <li><strong>POST /users/default/send</strong> - Enviar mensagem</li>
                        </ul>
                    </div>

                    <h4>Gerenciamento de Usuários:</h4>
                    <ul>
                        <li>GET /users - Listar todos os usuários</li>
                        <li>POST /users/{userId}/register - Registrar novo usuário</li>
                        <li>GET /users/{userId}/status - Status do usuário</li>
                        <li>GET /users/{userId}/qr - QR Code do usuário</li>
                        <li>GET /users/{userId}/events - SSE do usuário</li>
                    </ul>
                    <h4>Funcionalidades por Usuário:</h4>
                    <ul>
                        <li>POST /users/{userId}/send - Enviar mensagem</li>
                        <li>GET /users/{userId}/messages - Mensagens do usuário</li>
                        <li>GET /users/{userId}/contacts - Contatos do usuário</li>
                        <li>GET /users/{userId}/chats - Chats do usuário</li>
                    </ul>

                    <div style="background: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 5px;">
                        <h4>💡 Como Usar:</h4>
                        <p>1. <strong>POST /users/default/register</strong> para registrar</p>
                        <p>2. <strong>GET /users/default/qr</strong> para obter QR Code</p>
                        <p>3. Escaneie o QR Code no WhatsApp</p>
                        <p>4. <strong>POST /users/default/send</strong> para enviar mensagens</p>
                    </div>
                </div>
            </body>
        </html>
    `);
});

// ========================================
// SISTEMA DE JOBS PARA NOTIFICAÇÕES
// ========================================

// Função para buscar follow-ups do dia
async function getFollowUpsForToday() {
    try {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        const { data: followUps, error } = await supabase
            .from('follow_ups')
            .select(`
                id,
                titulo,
                data_agendada,
                prioridade,
                tipo,
                leads (
                    nome_completo,
                    empresa,
                    telefone
                ),
                organizations (
                    id,
                    name,
                    admin_phone
                )
            `)
            .gte('data_agendada', todayStart.toISOString())
            .lte('data_agendada', todayEnd.toISOString())
            .order('data_agendada');

        if (error) {
            console.error('❌ Erro ao buscar follow-ups do dia:', error);
            return [];
        }

        return followUps || [];
    } catch (error) {
        console.error('❌ Erro na consulta de follow-ups:', error);
        return [];
    }
}

// Função para buscar eventos do dia no Supabase
async function getEventsForToday() {
    try {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        const { data: events, error } = await supabase
            .from('calendar_events')
            .select(`
                id,
                title,
                description,
                start_datetime,
                end_datetime,
                mentorado_id,
                mentorados (
                    nome_completo,
                    telefone
                )
            `)
            .gte('start_datetime', todayStart.toISOString())
            .lte('start_datetime', todayEnd.toISOString())
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

// Função para enviar mensagem via Baileys
async function sendBaileysMessage(phoneNumber, message) {
    const session = getSession(defaultUserId);

    if (!session || !session.isReady || !session.sock) {
        console.error('❌ [JOBS] Session default não está conectada');
        return false;
    }

    try {
        // Garantir que o número tenha o formato correto para Baileys
        let formattedNumber = phoneNumber.replace(/\D/g, '');
        if (!formattedNumber.startsWith('55')) {
            formattedNumber = '55' + formattedNumber;
        }
        formattedNumber += '@s.whatsapp.net';

        await session.sock.sendMessage(formattedNumber, { text: message });
        console.log(`✅ [JOBS] Mensagem enviada para ${phoneNumber}: ${message.substring(0, 50)}...`);
        return true;
    } catch (error) {
        console.error(`❌ [JOBS] Erro ao enviar para ${phoneNumber}:`, error);
        return false;
    }
}

// Função principal para verificar e enviar notificações
async function checkAndSendNotifications() {
    console.log('🔄 [JOBS] Verificando eventos para notificações...');

    const session = getSession(defaultUserId);
    if (!session || !session.isReady) {
        console.log('⚠️ [JOBS] Session default não está conectada. Pulando verificação.');
        return;
    }

    try {
        const events = await getEventsForToday();
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        let notificationsSent = 0;

        // Verificar se é horário da notificação matinal (9h-9h05)
        const isMorningTime = currentHour === 9 && currentMinute < 5;

        for (const event of events) {
            const eventStart = new Date(event.start_datetime);
            const timeDiffMinutes = (eventStart - now) / (1000 * 60);

            // Criar chave única para este evento e horário
            const eventKey = `${event.id}_${currentHour}_${Math.floor(currentMinute/5)}_${event.start_datetime}`;

            // Verificar se já enviamos notificação para este evento neste intervalo
            if (sentNotifications.has(eventKey)) {
                console.log(`🛡️ [JOBS] Notificação já enviada para evento: ${event.title} (chave: ${eventKey})`);
                continue;
            }

            let shouldSendMorning = false;
            let shouldSend30min = false;
            let shouldSend1h = false;

            // Verificar tipo de notificação
            if (isMorningTime) {
                shouldSendMorning = true;
                console.log(`📅 [JOBS] Notificação matinal para evento: ${event.title}`);
            } else if (timeDiffMinutes >= 25 && timeDiffMinutes <= 35) {
                shouldSend30min = true;
                console.log(`⏰ [JOBS] Notificação 30min antes: ${event.title}`);
            } else if (timeDiffMinutes >= 55 && timeDiffMinutes <= 65) {
                shouldSend1h = true;
                console.log(`⏰ [JOBS] Notificação 1h antes: ${event.title}`);
            } else {
                continue; // Não é hora de notificar este evento
            }

            // Preparar mensagens
            let message = '';
            let targetPhone = '';

            if (shouldSendMorning || shouldSend30min) {
                // Para mentorado (se existir)
                if (event.mentorado_id && event.mentorados && event.mentorados.telefone) {
                    targetPhone = event.mentorados.telefone;

                    if (shouldSendMorning) {
                        message = `Bom dia, ${event.mentorados.nome_completo || 'amigo'}! ☀️\n\n` +
                                `Daqui a pouco, às ${eventStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}, teremos nossa call para abrir um caminho de mais liberdade e resultados consistentes para você.\n\n` +
                                `Esse é um espaço exclusivo para destravar pontos que hoje te prendem e já traçar passos claros rumo à transformação que você busca — tanto profissional quanto pessoal.`;
                    } else {
                        message = `Oi ${event.mentorados.nome_completo || 'amigo'}! Falta só meia hora para nossa call 🙌\n\n` +
                                `Prepare um lugar tranquilo para que a gente possa mergulhar de verdade no seu cenário e já construir juntos os primeiros passos rumo à sua liberdade e transformação. 🚀`;
                    }

                    if (event.description) {
                        message += `\n\nDescrição: ${event.description}`;
                    }

                    const sent = await sendBaileysMessage(targetPhone, message);
                    if (sent) {
                        notificationsSent++;
                        // Marcar como enviado
                        sentNotifications.add(eventKey);
                    }
                }
            }

            if (shouldSend1h || !event.mentorado_id) {
                // Para admin (Gabriel)
                if (event.mentorado_id && event.mentorados) {
                    message = `📅 Lembrete: Call com ${event.mentorados.nome_completo} hoje às ${eventStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}\n\nEvento: ${event.title}`;
                } else {
                    message = `📅 Lembrete do seu evento de hoje: ${event.title} - ${eventStart.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
                }

                if (event.description) {
                    message += `\n\nDescrição: ${event.description}`;
                }

                const sent = await sendBaileysMessage(await getAdminPhone(), message);
                if (sent) {
                    notificationsSent++;
                    // Marcar como enviado
                    sentNotifications.add(eventKey);
                }
            }
        }

        console.log(`✅ [JOBS] Verificação concluída. ${notificationsSent} notificações enviadas.`);

        // Limpeza: remover notificações antigas (mais de 6 horas)
        const cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const keysToRemove = Array.from(sentNotifications).filter(key => {
            const keyParts = key.split('_');
            if (keyParts.length >= 4) {
                const keyDate = new Date(keyParts.slice(3).join('_'));
                return keyDate < cutoffTime;
            }
            return true; // Remove chaves malformadas
        });

        keysToRemove.forEach(key => sentNotifications.delete(key));
        if (keysToRemove.length > 0) {
            console.log(`🧹 [JOBS] Limpeza: ${keysToRemove.length} notificações antigas removidas.`);
        }

    } catch (error) {
        console.error('❌ [JOBS] Erro na verificação de notificações:', error);
    }
}

// Controle de mensagens já enviadas
const sentNotifications = new Set();

// Configurar cron jobs
function setupCronJobs() {
    // Job principal: verificar a cada 5 minutos (mudado de 2 para 5 minutos)
    cron.schedule('*/5 * * * *', () => {
        checkAndSendNotifications();
    });

    // Job específico para 9h da manhã
    cron.schedule('0 9 * * *', () => {
        console.log('🌅 [JOBS] Executando job de notificações matinais...');
        checkAndSendNotifications();
    });

    console.log('⏰ [JOBS] Cron jobs configurados:');
    console.log('   - Verificação a cada 2 minutos');
    console.log('   - Notificação matinal às 9h');
}

// Endpoint para testar notificações manualmente
app.post('/test-notifications', async (req, res) => {
    console.log('🧪 [JOBS] Testando sistema de notificações...');
    await checkAndSendNotifications();
    res.json({ success: true, message: 'Teste de notificações executado' });
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

// ==========================================
// SISTEMA DE NOTIFICAÇÕES E ANTI-SPAM
// ==========================================

// Função para marcar evento como mensagem enviada (anti-spam)
async function markEventMessageSent(eventId) {
    try {
        const { error } = await supabase
            .from('calendar_events')
            .update({ mensagem_enviada: true })
            .eq('id', eventId);

        if (error) {
            console.error('❌ Erro ao marcar evento como enviado:', error);
            return false;
        }

        console.log(`✅ Evento ${eventId} marcado como mensagem enviada`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao marcar evento:', error);
        return false;
    }
}

// Função para obter horário de São Paulo usando timezone correta
function getSaoPauloTime() {
    return new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"});
}

// Função para verificar se usuário pertence a uma organização
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

        console.log('🔍 Input original:', phoneNumber);
        console.log('🔍 Após limpeza:', originalPhone);
        console.log('🔍 Sem código país:', cleanPhone);
        console.log('🔍 Testando números:', numbersToTest);

        // Buscar na tabela organizations por admin_phone
        for (const testNumber of numbersToTest) {
            const { data: org, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('admin_phone', testNumber)
                .single();

            if (org && !error) {
                console.log('✅ Organização encontrada:', org.name);
                console.log('📞 Número testado que deu match:', testNumber);
                console.log('📞 admin_phone no banco:', org.admin_phone);
                return org;
            } else {
                console.log('❌ Não encontrado para:', testNumber);
            }
        }

        console.log('❌ Usuário não é admin de nenhuma organização');
        return null;
    } catch (error) {
        console.error('❌ Erro ao buscar organização do usuário:', error);
        return null;
    }
}

// Função para buscar faturamento de uma organização (usando tabela leads)
async function getFaturamentoForOrganization(organizationId) {
    try {
        console.log('💰 Buscando faturamento para organização ID:', organizationId);

        // Usar timezone de São Paulo para calcular período do mês atual
        const saoPauloTime = new Date(getSaoPauloTime());
        const currentYear = saoPauloTime.getFullYear();
        const currentMonth = saoPauloTime.getMonth() + 1; // getMonth() retorna 0-11
        
        // Primeiro e último dia do mês atual
        const firstDayOfMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
        const lastDayOfMonthStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

        console.log(`📅 Buscando vendas do período: ${firstDayOfMonth} até ${lastDayOfMonthStr}`);

        // Buscar vendas da organização específica no mês atual
        const { data: vendas, error } = await supabase
            .from('leads')
            .select(`
                id,
                nome_completo,
                valor_vendido,
                data_venda,
                status
            `)
            .eq('organization_id', organizationId)
            .eq('status', 'vendido')
            .gte('data_venda', firstDayOfMonth)
            .lte('data_venda', lastDayOfMonthStr)
            .order('data_venda', { ascending: false });

        console.log('💰 DEBUG - Query vendas:', { error, count: vendas?.length || 0 });
        if (error) {
            console.error('❌ ERRO DETALHADO vendas:', JSON.stringify(error, null, 2));
            return { totalFaturado: 0, vendas: [], periodo: `${firstDayOfMonth} até ${lastDayOfMonthStr}` };
        }

        const totalFaturado = vendas?.reduce((sum, venda) => sum + (venda.valor_vendido || 0), 0) || 0;

        console.log(`💰 Faturamento do mês: R$ ${totalFaturado} (${vendas?.length || 0} vendas)`);

        return { 
            totalFaturado, 
            vendas: vendas || [], 
            periodo: `${firstDayOfMonth} até ${lastDayOfMonthStr}`,
            mesAno: `${currentMonth}/${currentYear}`
        };
    } catch (error) {
        console.error('❌ Erro na consulta de faturamento:', error);
        return { totalFaturado: 0, vendas: [], periodo: 'Erro ao calcular período', mesAno: 'N/A' };
    }
}

// Função para buscar pendências de uma organização
async function getPendenciasForOrganization(organizationId) {
    try {
        console.log('⚠️ Buscando pendências para organização ID:', organizationId);

        // Usar timezone de São Paulo para calcular período do mês atual
        const saoPauloTime = new Date(getSaoPauloTime());
        const currentYear = saoPauloTime.getFullYear();
        const currentMonth = saoPauloTime.getMonth() + 1;
        
        // Primeiro e último dia do mês atual
        const firstDayOfMonth = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
        const lastDayOfMonthStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;

        console.log(`📅 Buscando pendências do período: ${firstDayOfMonth} até ${lastDayOfMonthStr}`);

        // Buscar dívidas pendentes ou atrasadas do mês atual
        const { data: pendencias, error } = await supabase
            .from('dividas')
            .select(`
                id,
                valor,
                status,
                mentorado_id,
                mentorado_nome,
                data_vencimento,
                data_pagamento,
                observacoes,
                mentorados!inner(organization_id)
            `)
            .eq('mentorados.organization_id', organizationId)
            .in('status', ['pendente', 'atrasado'])
            .gte('data_vencimento', firstDayOfMonth)
            .lte('data_vencimento', lastDayOfMonthStr)
            .order('data_vencimento', { ascending: true });

        console.log('⚠️ DEBUG - Query pendências:', { error, count: pendencias?.length || 0 });
        if (error) {
            console.error('❌ ERRO DETALHADO pendências:', JSON.stringify(error, null, 2));
            return [];
        }

        console.log(`⚠️ Pendências do mês encontradas: ${pendencias?.length || 0}`);

        return pendencias || [];
    } catch (error) {
        console.error('❌ Erro na consulta de pendências:', error);
        return [];
    }
}

// Função para buscar eventos de uma organização
async function getEventsForOrganization(organizationId) {
    try {
        // Usar timezone correto de São Paulo
        const saoPauloTime = new Date(getSaoPauloTime());
        const todayStart = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        
        // Converter para UTC para consulta no banco
        const todayStartUTC = new Date(todayStart.getTime() - saoPauloTime.getTimezoneOffset() * 60000);
        const todayEndUTC = new Date(todayEnd.getTime() - saoPauloTime.getTimezoneOffset() * 60000);

        console.log('📅 Buscando eventos para organização ID:', organizationId);
        console.log('📅 Data inicio UTC:', todayStartUTC.toISOString());
        console.log('📅 Data fim UTC:', todayEndUTC.toISOString());

        // DEBUG: Buscar TODOS os eventos desta organização (sem filtro de data)
        const { data: allEvents } = await supabase
            .from('calendar_events')
            .select('id, title, start_datetime, organization_id')
            .eq('organization_id', organizationId);
        
        console.log('🔍 TODOS os eventos desta organização:', allEvents?.length || 0);
        if (allEvents && allEvents.length > 0) {
            allEvents.forEach(event => {
                console.log(`📅 Evento: ${event.title} - ${event.start_datetime} (org: ${event.organization_id})`);
            });
        }

        // DEBUG: Buscar org com admin_phone específico
        const { data: debugOrg } = await supabase
            .from('organizations')
            .select('id, name, admin_phone')
            .eq('admin_phone', '83921485650')
            .single();
        
        if (debugOrg) {
            console.log('🔍 Org com admin 83921485650:', debugOrg);
            
            const { data: debugEvents } = await supabase
                .from('calendar_events')
                .select('id, title, start_datetime, organization_id')
                .eq('organization_id', debugOrg.id);
            
            console.log('🔍 Eventos da org 83921485650:', debugEvents?.length || 0);
            if (debugEvents && debugEvents.length > 0) {
                debugEvents.forEach(event => {
                    console.log(`📅 Evento org 83921485650: ${event.title} - ${event.start_datetime}`);
                });
            }
        }

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
            console.error('❌ Erro ao buscar eventos:', error);
            return [];
        }

        console.log('📅 Eventos encontrados:', events?.length || 0);
        if (events && events.length > 0) {
            console.log('📅 Primeiro evento:', events[0]);
        }

        return events || [];
    } catch (error) {
        console.error('❌ Erro na consulta de eventos:', error);
        return [];
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

// Função para normalizar telefone brasileiro
function normalizePhone(phone) {
    if (!phone) return '';

    // Remover todos os caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');

    // Se começar com 55, já está no formato internacional
    if (cleanPhone.startsWith('55')) {
        return cleanPhone;
    }

    // Se tem 11 dígitos (celular), adicionar 55
    if (cleanPhone.length === 11) {
        return `55${cleanPhone}`;
    }

    // Se tem 10 dígitos (fixo), adicionar 55
    if (cleanPhone.length === 10) {
        return `55${cleanPhone}`;
    }

    return cleanPhone;
}

// Função para buscar eventos do dia no Supabase com dados de leads/mentorados
async function getEventsForToday() {
    try {
        // Buscar eventos desde 12h atrás até 72h no futuro (janela mais ampla)
        const now = new Date();
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const threeDaysFromNow = new Date(now.getTime() + 72 * 60 * 60 * 1000);

        console.log(`🔍 Buscando eventos desde: ${twelveHoursAgo.toISOString()} até ${threeDaysFromNow.toISOString()}`);

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
            .gte('start_datetime', twelveHoursAgo.toISOString())
            .lte('start_datetime', threeDaysFromNow.toISOString())
            .order('start_datetime');

        if (error) {
            console.error('Erro ao buscar eventos:', error);
            return [];
        }

        console.log(`📅 Eventos próximos encontrados: ${events?.length || 0}`);

        return events || [];
    } catch (error) {
        console.error('Erro na consulta de eventos:', error);
        return [];
    }
}

// Função para enviar mensagem via WhatsApp (usando sessão default)
async function sendWhatsAppMessage(phoneNumber, message) {
    const defaultSession = userSessions.get(defaultUserId);

    if (!defaultSession || !defaultSession.sock || !defaultSession.isReady) {
        console.error('Cliente WhatsApp default não está conectado');
        return false;
    }

    try {
        // Garantir que o número tenha o formato correto
        let formattedNumber = phoneNumber.replace(/\D/g, '');
        if (!formattedNumber.endsWith('@s.whatsapp.net')) {
            formattedNumber += '@s.whatsapp.net';
        }

        // Se message é um objeto (com botões), usar diretamente
        // Se é string, converter para objeto de texto
        let messageContent;
        if (typeof message === 'object' && message !== null) {
            messageContent = message;
        } else {
            messageContent = { text: message };
        }

        await defaultSession.sock.sendMessage(formattedNumber, messageContent);
        console.log(`📱 Mensagem enviada para: ${phoneNumber}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${phoneNumber}:`, error);
        return false;
    }
}

// Função principal de verificação e envio de notificações
async function checkAndSendNotifications(isDailySummary = false) {
    try {
        console.log(`🔍 ${isDailySummary ? 'Enviando resumo diário' : 'Verificando notificações'} - ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

        const events = await getEventsForToday();
        console.log(`📅 Eventos encontrados hoje: ${events.length}`);

        if (events.length === 0) {
            console.log('ℹ️ Nenhum evento encontrado para hoje.');
            return;
        }

        let notificationsSent = 0;
        const saoPauloNow = new Date(getSaoPauloTime());

        // Resumo diário às 7h da manhã (horário SP)
        if (isDailySummary) {
            console.log('🌅 Enviando resumo diário dos compromissos...');

            // Buscar eventos do dia considerando timezone SP
            const saoPauloTime = new Date();
            saoPauloTime.setHours(saoPauloTime.getHours()); // Converter para SP

            const todayStart = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

            // Converter de volta para UTC para buscar no banco
            const todayStartUTC = new Date(todayStart.getTime() + 3 * 60 * 60 * 1000);
            const todayEndUTC = new Date(todayEnd.getTime() + 3 * 60 * 60 * 1000);

            const eventsToday = events.filter(event => {
                const eventTime = new Date(event.start_datetime);
                return eventTime >= todayStartUTC && eventTime < todayEndUTC;
            });

            // Buscar follow-ups do dia
            const followUpsToday = await getFollowUpsForToday();
            console.log(`📅 Follow-ups encontrados para hoje: ${followUpsToday.length}`);

            if (eventsToday.length > 0 || followUpsToday.length > 0) {
                const today = new Date();
                const weekdays = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
                const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
                const dayName = weekdays[today.getDay()];
                const dayNumber = today.getDate();
                const monthName = months[today.getMonth()];
                const year = today.getFullYear();

                let summaryMessage = `🌅 AGENDA DE HOJE GM - ${dayName}, ${dayNumber} DE ${monthName} DE ${year}\n\n`;
                summaryMessage += `📊 ${eventsToday.length} evento(s) agendado(s):\n\n`;

                let eventIndex = 1;
                let mentoradosCount = 0;
                let leadsCount = 0;

                for (const event of eventsToday) {
                    const eventTime = new Date(event.start_datetime);
                    // Usar horário original do banco
                    const eventTimeSP = new Date(eventTime.getTime());
                    const startTime = eventTimeSP.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    // Usar horário real de fim do evento
                    const eventEndTime = new Date(event.end_datetime);
                    const eventEndSP = new Date(eventEndTime.getTime());
                    const endTime = eventEndSP.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    summaryMessage += `${eventIndex}. 📅 ${event.title}\n`;
                    summaryMessage += `   ⏰ ${startTime} - ${endTime}\n`;

                    if (event.mentorado_id && event.mentorados) {
                        summaryMessage += `   👤 Mentorado: ${event.mentorados.nome_completo}\n`;
                        summaryMessage += `   🎓 Turma: ${event.mentorados.turma || 'N/A'}\n`;
                        mentoradosCount++;
                    } else if (event.lead_id && event.leads) {
                        summaryMessage += `   👤 Lead: ${event.leads.nome_completo}\n`;
                        const observacao = event.leads.observacao ? `${event.leads.observacao} 🔥` : '🔥';
                        summaryMessage += `   📱 ${observacao}\n`;
                        leadsCount++;
                    }

                    summaryMessage += '\n';
                    eventIndex++;
                }

                // Buscar follow-ups para hoje (simplificado)
                let followUps = [];
                try {
                    const { data: followUpsToday, error: followUpError } = await supabase
                        .from('lead_followups')
                        .select(`
                            titulo,
                            data_agendada,
                            tipo,
                            prioridade,
                            leads:lead_id (
                                nome_completo,
                                empresa,
                                telefone
                            )
                        `)
                        .eq('status', 'pendente')
                        .gte('data_agendada', todayStartUTC.toISOString())
                        .lt('data_agendada', todayEndUTC.toISOString())
                        .order('data_agendada', { ascending: true });

                    if (followUpError) {
                        console.log('⚠️ Tabela lead_followups não encontrada - criando dados mock:', followUpError.message);
                        // Criar follow-ups mock para teste
                        followUps = [];
                    } else {
                        followUps = followUpsToday || [];
                    }
                } catch (error) {
                    console.log('⚠️ Erro ao buscar follow-ups, usando dados vazios:', error.message);
                    followUps = [];
                }

                // Adicionar follow-ups à mensagem se houver
                if (followUps.length > 0) {
                    summaryMessage += `\n⏰ FOLLOW-UPS PARA HOJE (${followUps.length}):\n\n`;

                    followUps.forEach((followUp, index) => {
                        const followUpTime = new Date(followUp.data_agendada);
                        const timeStr = followUpTime.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        const prioridadeEmoji = {
                            'urgente': '🚨',
                            'alta': '🔥',
                            'media': '⚡',
                            'baixa': '📝'
                        };

                        const tipoEmoji = {
                            'call': '📞',
                            'email': '📧',
                            'whatsapp': '💬',
                            'meeting': '🤝',
                            'proposal': '📄'
                        };

                        summaryMessage += `${index + 1}. ${prioridadeEmoji[followUp.prioridade] || '📝'} ${followUp.titulo}\n`;
                        summaryMessage += `   ⏰ ${timeStr} - ${tipoEmoji[followUp.tipo] || '📝'} ${followUp.tipo}\n`;

                        if (followUp.leads) {
                            const lead = followUp.leads;
                            summaryMessage += `   👤 Lead: ${lead.nome_completo}`;
                            if (lead.empresa) {
                                summaryMessage += ` (${lead.empresa})`;
                            }
                            summaryMessage += `\n`;

                            if (lead.telefone) {
                                summaryMessage += `   📱 ${lead.telefone}\n`;
                            }

                            // Informações de qualificação
                            if (lead.nivel_interesse || lead.temperatura || lead.urgencia_compra) {
                                let qualificacao = '   🎯 ';
                                if (lead.nivel_interesse) {
                                    qualificacao += `Interesse: ${lead.nivel_interesse}/10 `;
                                }
                                if (lead.temperatura) {
                                    const tempEmoji = lead.temperatura === 'quente' ? '🔥' : lead.temperatura === 'morno' ? '🟠' : '🔵';
                                    qualificacao += `${tempEmoji} ${lead.temperatura} `;
                                }
                                if (lead.urgencia_compra) {
                                    qualificacao += `⚡ ${lead.urgencia_compra}`;
                                }
                                summaryMessage += `${qualificacao}\n`;
                            }

                            // Informações financeiras
                            if (lead.orcamento_disponivel) {
                                summaryMessage += `   💰 Orçamento: R$ ${lead.orcamento_disponivel.toLocaleString('pt-BR')}\n`;
                            }

                            // Responsável
                            if (lead.responsavel_vendas) {
                                summaryMessage += `   👨‍💼 Responsável: ${lead.responsavel_vendas}\n`;
                            }

                            // Observações específicas
                            if (lead.observacao) {
                                summaryMessage += `   📝 ${lead.observacao}\n`;
                            }
                        }

                        if (followUp.descricao) {
                            summaryMessage += `   💬 ${followUp.descricao}\n`;
                        }

                        summaryMessage += '\n';
                    });
                }

                summaryMessage += `📈 RESUMO DO DIA:\n`;
                summaryMessage += `• Total de eventos: ${eventsToday.length}\n`;
                summaryMessage += `• Mentorados: ${mentoradosCount}\n`;
                summaryMessage += `• Leads: ${leadsCount}\n`;
                if (followUps.length > 0) {
                    summaryMessage += `• Follow-ups: ${followUps.length}\n`;
                }

                // Adicionar follow-ups independentes do dia
                if (followUpsToday.length > 0) {
                    summaryMessage += '\n📞 LEMBRETES DE FOLLOW-UP HOJE:\n\n';
                    
                    followUpsToday.forEach((followUp, index) => {
                        const followUpTime = new Date(followUp.data_agendada);
                        const timeStr = followUpTime.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        
                        const prioridadeEmoji = {
                            'alta': '🔴',
                            'media': '🟡', 
                            'baixa': '🟢'
                        };
                        
                        const tipoEmoji = {
                            'call': '📞',
                            'email': '📧',
                            'whatsapp': '💬',
                            'meeting': '🤝'
                        };

                        summaryMessage += `${index + 1}. ${prioridadeEmoji[followUp.prioridade] || '📝'} ${followUp.titulo}\n`;
                        summaryMessage += `   ⏰ ${timeStr} - ${tipoEmoji[followUp.tipo] || '📝'}\n`;
                        
                        if (followUp.leads) {
                            summaryMessage += `   👤 ${followUp.leads.nome_completo}\n`;
                            if (followUp.leads.telefone) {
                                summaryMessage += `   📱 ${followUp.leads.telefone}\n`;
                            }
                        }
                        summaryMessage += '\n';
                    });
                }

                summaryMessage += '\n🚀 Tenha um dia produtivo!';

                const sent = await sendDailySummaryToAllOrganizations(summaryMessage);
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

            // Converter para horário de São Paulo corretamente
            const eventStartSP = new Date(eventStart.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
            const nowSP = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));

            const timeDiffMinutes = (eventStartSP - nowSP) / (1000 * 60);

            console.log(`🕐 Evento: ${event.title}`);
            console.log(`   Start UTC: ${eventStart.toISOString()}`);
            console.log(`   Start SP: ${eventStartSP.toISOString()} (${eventStartSP.toLocaleString('pt-BR')})`);
            console.log(`   Now SP: ${nowSP.toISOString()} (${nowSP.toLocaleString('pt-BR')})`);
            console.log(`   Diff: ${Math.round(timeDiffMinutes)} minutos`);

            // Enviar apenas lembrete de 30 minutos (mais preciso: entre 28 e 32 minutos)
            if (timeDiffMinutes >= 28 && timeDiffMinutes <= 32) {
                // Verificar se já enviou mensagem para este evento (campo direto na tabela)
                if (event.mensagem_enviada) {
                    console.log(`⏭️ Lembrete já enviado para: ${event.title} - campo mensagem_enviada = true`);
                    continue;
                }

                console.log(`⏰ Enviando lembrete de 30min para: ${event.title} (diff: ${Math.round(timeDiffMinutes)}min)`);
                addNotificationLog('info', `Iniciando envio de lembrete para evento: ${event.title}`, {
                    eventId: event.id,
                    title: event.title,
                    diffMinutes: Math.round(timeDiffMinutes),
                    startTime: eventStartSP.toLocaleString('pt-BR')
                });

                // Marcar como enviado ANTES de enviar mensagem
                const marked = await markEventMessageSent(event.id);
                if (!marked) {
                    console.log(`❌ Falha ao marcar evento ${event.id} como enviado. Pulando para evitar spam.`);
                    addNotificationLog('error', `Falha ao marcar evento como enviado: ${event.title}`, {
                        eventId: event.id
                    });
                    continue;
                }

                // Para mentorado
                if (event.mentorado_id && event.mentorados && event.mentorados.telefone) {
                    const normalizedPhone = normalizePhone(event.mentorados.telefone);
                    console.log(`📞 Mentorado phone: ${event.mentorados.telefone} → normalized: ${normalizedPhone}`);

                    const message = `Olá ${event.mentorados.nome_completo}, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡`;

                    const messageWithButton = {
                        text: message,
                        footer: "Médicos de Resultado",
                        buttons: [{
                            buttonId: `confirm_call_${event.id}`,
                            buttonText: { displayText: 'Tudo certo!' },
                            type: 1
                        }],
                        headerType: 1
                    };

                    const sent = await sendWhatsAppMessage(normalizedPhone, messageWithButton);

                    // Agendar mensagem de follow-up em 10 minutos se não receber resposta
                    setTimeout(async () => {
                        // Verificar se ainda não recebeu resposta
                        const followUpMessage = "É importante que você confirme a nossa call.";
                        await sendWhatsAppMessage(normalizedPhone, followUpMessage);
                    }, 10 * 60 * 1000); // 10 minutos

                    if (sent) {
                        notificationsSent++;
                        console.log(`✅ Lembrete enviado para mentorado: ${event.mentorados.nome_completo}`);
                        addNotificationLog('success', `Lembrete enviado para mentorado: ${event.mentorados.nome_completo}`, {
                            eventId: event.id,
                            phone: normalizedPhone,
                            type: 'mentorado'
                        });
                    } else {
                        addNotificationLog('error', `Falha ao enviar lembrete para mentorado: ${event.mentorados.nome_completo}`, {
                            eventId: event.id,
                            phone: normalizedPhone,
                            type: 'mentorado'
                        });
                    }
                }

                // Para lead (mesmo tipo de mensagem)
                console.log(`🔍 Debug lead - event.lead_id: ${event.lead_id}, event.leads: ${JSON.stringify(event.leads)}`);

                if (event.lead_id && event.leads && event.leads.telefone) {
                    const normalizedPhone = normalizePhone(event.leads.telefone);
                    console.log(`📞 Lead phone: ${event.leads.telefone} → normalized: ${normalizedPhone}`);
                    console.log(`📱 Enviando mensagem para lead: ${event.leads.nome_completo} (${normalizedPhone})`);

                    const message = `Olá ${event.leads.nome_completo}, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡`;

                    const messageWithButton = {
                        text: message,
                        footer: "Médicos de Resultado",
                        buttons: [{
                            buttonId: `confirm_call_${event.id}`,
                            buttonText: { displayText: 'Tudo certo!' },
                            type: 1
                        }],
                        headerType: 1
                    };

                    const sent = await sendWhatsAppMessage(normalizedPhone, messageWithButton);

                    // Agendar mensagem de follow-up em 10 minutos se não receber resposta
                    setTimeout(async () => {
                        // Verificar se ainda não recebeu resposta
                        const followUpMessage = "É importante que você confirme a nossa call.";
                        await sendWhatsAppMessage(normalizedPhone, followUpMessage);
                    }, 10 * 60 * 1000); // 10 minutos

                    if (sent) {
                        notificationsSent++;
                        console.log(`✅ Lembrete enviado para lead: ${event.leads.nome_completo}`);
                        addNotificationLog('success', `Lembrete enviado para lead: ${event.leads.nome_completo}`, {
                            eventId: event.id,
                            phone: normalizedPhone,
                            type: 'lead'
                        });
                    } else {
                        console.log(`❌ Falha ao enviar lembrete para lead: ${event.leads.nome_completo}`);
                        addNotificationLog('error', `Falha ao enviar lembrete para lead: ${event.leads.nome_completo}`, {
                            eventId: event.id,
                            phone: normalizedPhone,
                            type: 'lead'
                        });
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

                const sentAdmin = await sendWhatsAppMessage(await getAdminPhone(), adminMessage);
                if (sentAdmin) {
                    notificationsSent++;
                    console.log(`✅ Lembrete enviado para admin sobre: ${event.title}`);
                    addNotificationLog('success', `Lembrete enviado para admin sobre: ${event.title}`, {
                        eventId: event.id,
                        phone: adminPhone,
                        type: 'admin'
                    });
                } else {
                    addNotificationLog('error', `Falha ao enviar lembrete para admin sobre: ${event.title}`, {
                        eventId: event.id,
                        phone: adminPhone,
                        type: 'admin'
                    });
                }
            }
        }

        console.log(`✅ Verificação concluída. ${notificationsSent} notificações enviadas.`);
        addNotificationLog('info', `Verificação de notificações concluída`, {
            totalEventos: events.length,
            notificacoesEnviadas: notificationsSent,
            isDailySummary
        });

    } catch (error) {
        console.error('❌ Erro na verificação de notificações:', error);
        addNotificationLog('error', `Erro na verificação de notificações: ${error.message}`, {
            error: error.message,
            stack: error.stack
        });
    }
}

// Configurar cron jobs
function setupCronJobs() {
    // Job principal: verificar a cada 2 minutos para lembretes de 30min
    cron.schedule('*/2 * * * *', () => {
        addNotificationLog('debug', 'Executando verificação automática de lembretes (30min)');
        checkAndSendNotifications(false);
    });

    // Job para resumo diário às 10h da manhã (horário de São Paulo) = 7h UTC
    cron.schedule('0 7 * * *', () => {
        console.log('🌅 Enviando resumo diário dos compromissos...');
        addNotificationLog('info', 'Executando resumo diário dos compromissos (10h SP)');
        checkAndSendNotifications(true);
    });

    console.log('⏰ Cron jobs configurados:');
    console.log('   - Verificação de lembretes a cada 2 minutos (30min antes)');
    console.log('   - Resumo diário às 7h UTC (10h São Paulo)');

    // 🧪 TESTE IMEDIATO DO RESUMO DIÁRIO
    console.log('🧪 EXECUTANDO TESTE IMEDIATO DO RESUMO DIÁRIO...');
    setTimeout(() => {
        checkAndSendNotifications(true);
    }, 3000); // Aguardar 3 segundos para o servidor inicializar
    addNotificationLog('success', 'Sistema de cron jobs configurado e ativo', {
        jobs: [
            'Verificação de lembretes a cada 2 minutos',
            'Resumo diário às 7h (São Paulo)'
        ]
    });
}

// Endpoint para testar notificações manualmente
app.post('/test-notifications', async (req, res) => {
    const { isDailySummary } = req.body;
    console.log('🧪 Testando sistema de notificações...');
    await checkAndSendNotifications(isDailySummary || false);
    res.json({ success: true, message: `Teste de ${isDailySummary ? 'resumo diário' : 'notificações'} executado` });
});

// Endpoint para testar apenas o resumo diário
app.post('/test-daily-summary', async (req, res) => {
    console.log('🌅 Testando resumo diário...');
    await checkAndSendNotifications(true);
    res.json({ success: true, message: 'Teste de resumo diário executado' });
});

// Endpoint para forçar envio de mensagem de teste
app.post('/test-whatsapp', async (req, res) => {
    try {
        const { phone, message } = req.body;
        const phoneToUse = phone || await getAdminPhone();
        const messageToUse = message || 'Teste de mensagem do sistema de lembretes! 🚀';

        console.log(`📱 Testando envio para: ${phoneToUse}`);

        const sent = await sendWhatsAppMessage(phoneToUse, messageToUse);

        res.json({
            success: sent,
            message: sent ? 'Mensagem enviada com sucesso!' : 'Falha ao enviar mensagem',
            phone: phoneToUse,
            whatsappReady: userSessions.get(defaultUserId)?.isReady || false
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Endpoint para envio de notificações de follow-up
app.post('/send-event-notification', async (req, res) => {
    try {
        const { message, eventData } = req.body;
        console.log('🎯 [EVENT] Recebida notificação de novo evento:', { eventData });

        // Enviar para todas as organizações
        const successfulSends = await sendDailySummaryToAllOrganizations(message);

        res.json({
            success: true,
            message: 'Notificação de evento enviada',
            organizations_notified: successfulSends
        });

    } catch (error) {
        console.error('❌ [EVENT] Erro ao enviar notificação de evento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/send-notification', async (req, res) => {
    try {
        const { message, type } = req.body;

        if (!message) {
            return res.json({
                success: false,
                error: 'Mensagem não fornecida'
            });
        }

        console.log(`📬 Enviando notificação de ${type || 'follow-up'}...`);

        const sent = await sendWhatsAppMessage(await getAdminPhone(), message);

        if (sent) {
            console.log('✅ Notificação de follow-up enviada com sucesso!');
            addNotificationLog('success', `Notificação ${type || 'follow-up'} enviada`, {
                message: message.substring(0, 100) + '...'
            });
        } else {
            console.log('❌ Falha ao enviar notificação de follow-up');
            addNotificationLog('error', `Falha ao enviar notificação ${type || 'follow-up'}`, {
                adminPhone: await getAdminPhone(),
                messageLength: message.length
            });
        }

        res.json({
            success: sent,
            message: sent ? 'Notificação enviada com sucesso!' : 'Falha ao enviar notificação',
            type: type || 'follow-up',
            whatsappReady: userSessions.get(defaultUserId)?.isReady || false
        });

    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
        addNotificationLog('error', 'Erro ao enviar notificação', {
            error: error.message
        });
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para testar lembrete forçado (ignora tempo)
app.post('/test-reminder-force', async (req, res) => {
    try {
        const events = await getEventsForToday();

        if (events.length === 0) {
            return res.json({ success: false, message: 'Nenhum evento encontrado para testar' });
        }

        const event = events[0]; // Pegar primeiro evento
        console.log(`🧪 TESTE FORÇADO - Enviando lembrete para: ${event.title}`);

        let messagesSent = 0;

        // Para lead
        if (event.lead_id && event.leads && event.leads.telefone) {
            const message = `Oi ${event.leads.nome}! Falta meia hora para nossa call 🙌\n\n` +
                          `Prepare um lugar tranquilo para que a gente possa mergulhar de verdade no seu cenário e já construir juntos os primeiros passos rumo à sua liberdade e transformação. 🚀`;

            const sent = await sendWhatsAppMessage(event.leads.telefone, message);
            if (sent) messagesSent++;
        }

        // Para admin
        const adminMessage = `📅 TESTE - Lembrete: Call com ${event.leads?.nome || 'lead'} em 30 minutos!\n\nEvento: ${event.title}`;
        const sentAdmin = await sendWhatsAppMessage(await getAdminPhone(), adminMessage);
        if (sentAdmin) messagesSent++;

        res.json({
            success: messagesSent > 0,
            message: `Teste realizado! ${messagesSent} mensagens enviadas`,
            event: {
                title: event.title,
                lead: event.leads?.nome,
                phone: event.leads?.telefone
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Endpoint para debug de eventos com leads
app.get('/debug/events', async (req, res) => {
    try {
        // Buscar dados RAW do Supabase para debug completo
        console.log('🔍 Fazendo busca RAW no Supabase...');

        const { data: rawEvents, error: rawError } = await supabase
            .from('calendar_events')
            .select(`
                *,
                mentorados (*),
                leads (*)
            `)
            .gte('start_datetime', '2025-10-13')
            .order('start_datetime')
            .limit(10);

        console.log('📊 Resposta RAW do Supabase:');
        console.log('- Error:', rawError);
        console.log('- Data length:', rawEvents?.length || 0);
        console.log('- First event:', rawEvents?.[0] || 'nenhum');

        // Também testar a função getEventsForToday
        const processedEvents = await getEventsForToday();

        res.json({
            success: true,
            supabaseRaw: {
                error: rawError,
                totalEvents: rawEvents?.length || 0,
                events: rawEvents || []
            },
            processedEvents: {
                total: processedEvents.length,
                events: processedEvents
            },
            debug: {
                supabaseUrl: supabaseUrl,
                hasSupabaseKey: !!supabaseKey,
                keyPreview: supabaseKey?.substring(0, 20) + '...'
            }
        });
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        res.json({ success: false, error: error.message, stack: error.stack });
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

// Endpoint para testar query diretamente
app.get('/debug/query-test', async (req, res) => {
    try {
        // Test 1: Buscar eventos de hoje usando data string
        const todayStr = '2025-10-13';

        const { data: eventsToday, error: errorToday } = await supabase
            .from('calendar_events')
            .select(`
                id,
                title,
                start_datetime,
                mensagem_enviada,
                mentorados (nome_completo),
                leads (nome)
            `)
            .gte('start_datetime', todayStr)
            .lt('start_datetime', '2025-10-14')
            .order('start_datetime');

        // Test 2: Buscar todos os eventos recentes
        const { data: allRecent, error: errorAll } = await supabase
            .from('calendar_events')
            .select('id, title, start_datetime, mensagem_enviada')
            .gte('start_datetime', '2025-10-10')
            .order('start_datetime', { ascending: false })
            .limit(5);

        res.json({
            success: true,
            tests: {
                todayEvents: {
                    query: `>= ${todayStr} AND < 2025-10-14`,
                    count: eventsToday?.length || 0,
                    events: eventsToday || [],
                    error: errorToday
                },
                recentEvents: {
                    query: '>= 2025-10-10',
                    count: allRecent?.length || 0,
                    events: allRecent || [],
                    error: errorAll
                }
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Endpoint temporário para debug de timezone
app.get('/debug/timezone', async (req, res) => {
    try {
        // Dados de timezone atual
        const saoPauloTime = new Date(getSaoPauloTime());
        const utcTime = new Date();

        const todayStart = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        const todayStartUTC = new Date(todayStart.getTime() - saoPauloTime.getTimezoneOffset() * 60000);
        const todayEndUTC = new Date(todayEnd.getTime() - saoPauloTime.getTimezoneOffset() * 60000);

        // Buscar TODOS os eventos sem filtro de data para comparar
        const { data: allEvents, error } = await supabase
            .from('calendar_events')
            .select(`
                id,
                title,
                start_datetime,
                created_at
            `)
            .order('start_datetime', { ascending: false })
            .limit(10);

        res.json({
            success: true,
            debug: {
                saoPauloTime: saoPauloTime.toISOString(),
                utcTime: utcTime.toISOString(),
                todayStart: todayStart.toISOString(),
                todayEnd: todayEnd.toISOString(),
                todayStartUTC: todayStartUTC.toISOString(),
                todayEndUTC: todayEndUTC.toISOString(),
                timezoneOffset: saoPauloTime.getTimezoneOffset(),
                queryRange: {
                    from: todayStartUTC.toISOString(),
                    to: todayEndUTC.toISOString()
                }
            },
            allEvents: allEvents || []
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Endpoint web para visualizar logs de notificações
app.get('/logs/notifications', (req, res) => {
    try {
        // Página HTML simples para visualizar logs em tempo real
        const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitor de Notificações - Dr. Gabriel Maia</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .header {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0;
            color: #2563eb;
            font-size: 24px;
        }
        .header p {
            margin: 5px 0 0 0;
            color: #666;
        }
        .status {
            display: flex;
            gap: 20px;
            margin: 20px 0;
        }
        .status-item {
            background: #fff;
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            flex: 1;
        }
        .status-item h3 {
            margin: 0 0 5px 0;
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
        }
        .status-item .value {
            font-size: 24px;
            font-weight: bold;
            color: #2563eb;
        }
        .logs-container {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-height: 600px;
            overflow-y: auto;
        }
        .logs-header {
            padding: 20px;
            border-bottom: 1px solid #e5e5e5;
            background: #f8f9fa;
            border-radius: 8px 8px 0 0;
        }
        .logs-header h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
        }
        .controls {
            margin-top: 15px;
            display: flex;
            gap: 10px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background: #2563eb;
            color: white;
        }
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        .log-entry {
            padding: 15px 20px;
            border-bottom: 1px solid #f0f0f0;
            transition: background-color 0.2s;
        }
        .log-entry:hover {
            background: #f8f9fa;
        }
        .log-entry.success {
            border-left: 4px solid #10b981;
        }
        .log-entry.error {
            border-left: 4px solid #ef4444;
        }
        .log-entry.info {
            border-left: 4px solid #3b82f6;
        }
        .log-entry.debug {
            border-left: 4px solid #8b5cf6;
        }
        .log-time {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .log-type {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            font-weight: bold;
            margin-right: 8px;
        }
        .log-type.success { background: #dcfce7; color: #166534; }
        .log-type.error { background: #fef2f2; color: #991b1b; }
        .log-type.info { background: #dbeafe; color: #1e40af; }
        .log-type.debug { background: #f3e8ff; color: #7c3aed; }
        .log-message {
            margin: 5px 0;
            line-height: 1.4;
        }
        .log-data {
            font-size: 12px;
            color: #666;
            font-family: 'Monaco', 'Menlo', monospace;
            background: #f8f9fa;
            padding: 8px;
            border-radius: 4px;
            margin-top: 8px;
            white-space: pre-wrap;
        }
        .auto-refresh {
            color: #10b981;
            font-weight: bold;
        }
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📱 Monitor de Notificações WhatsApp</h1>
        <p>Sistema de agendamentos - Dr. Gabriel Maia</p>
        <div class="status">
            <div class="status-item">
                <h3>Status do Sistema</h3>
                <div class="value" id="systemStatus">🟢 Online</div>
            </div>
            <div class="status-item">
                <h3>Total de Logs</h3>
                <div class="value" id="totalLogs">0</div>
            </div>
            <div class="status-item">
                <h3>Última Atualização</h3>
                <div class="value" id="lastUpdate">--:--</div>
            </div>
        </div>
    </div>

    <div class="logs-container">
        <div class="logs-header">
            <h2>📋 Logs de Notificações (30min antes)</h2>
            <div class="controls">
                <button class="btn-primary" onclick="refreshLogs()">🔄 Atualizar</button>
                <button class="btn-secondary" onclick="clearLogs()">🗑️ Limpar</button>
                <button class="btn-primary" onclick="toggleAutoRefresh()" id="autoRefreshBtn">
                    ⏱️ Auto-refresh: OFF
                </button>
            </div>
        </div>
        <div id="logsContent">
            <div class="empty-state">
                🔍 Carregando logs...
            </div>
        </div>
    </div>

    <script>
        let autoRefreshInterval = null;
        let isAutoRefresh = false;

        function updateStatus() {
            document.getElementById('lastUpdate').textContent =
                new Date().toLocaleTimeString('pt-BR');
        }

        function refreshLogs() {
            fetch('/api/logs/notifications')
                .then(response => response.json())
                .then(data => {
                    const container = document.getElementById('logsContent');
                    const totalLogsEl = document.getElementById('totalLogs');

                    if (data.success && data.logs && data.logs.length > 0) {
                        totalLogsEl.textContent = data.logs.length;

                        container.innerHTML = data.logs.map(log => {
                            const dataStr = log.data && Object.keys(log.data).length > 0
                                ? JSON.stringify(log.data, null, 2)
                                : '';

                            return \`
                                <div class="log-entry \${log.type}">
                                    <div class="log-time">⏰ \${log.timestamp}</div>
                                    <div>
                                        <span class="log-type \${log.type}">\${log.type}</span>
                                        <span class="log-message">\${log.message}</span>
                                    </div>
                                    \${dataStr ? \`<div class="log-data">\${dataStr}</div>\` : ''}
                                </div>
                            \`;
                        }).join('');
                    } else {
                        totalLogsEl.textContent = '0';
                        container.innerHTML = \`
                            <div class="empty-state">
                                📭 Nenhum log de notificação encontrado.<br>
                                <small>Os logs aparecerão aqui quando notificações de 30min forem processadas.</small>
                            </div>
                        \`;
                    }

                    updateStatus();
                })
                .catch(error => {
                    console.error('Erro ao carregar logs:', error);
                    document.getElementById('logsContent').innerHTML = \`
                        <div class="empty-state" style="color: #ef4444;">
                            ❌ Erro ao carregar logs: \${error.message}
                        </div>
                    \`;
                });
        }

        function clearLogs() {
            if (confirm('Tem certeza que deseja limpar todos os logs?')) {
                fetch('/api/logs/notifications/clear', { method: 'POST' })
                    .then(() => refreshLogs())
                    .catch(error => console.error('Erro ao limpar logs:', error));
            }
        }

        function toggleAutoRefresh() {
            const btn = document.getElementById('autoRefreshBtn');

            if (isAutoRefresh) {
                clearInterval(autoRefreshInterval);
                isAutoRefresh = false;
                btn.textContent = '⏱️ Auto-refresh: OFF';
                btn.className = 'btn-primary';
            } else {
                autoRefreshInterval = setInterval(refreshLogs, 5000); // 5 segundos
                isAutoRefresh = true;
                btn.textContent = '⏱️ Auto-refresh: ON';
                btn.className = 'btn-secondary auto-refresh';
            }
        }

        // Carregar logs inicialmente
        refreshLogs();
    </script>
</body>
</html>`;

        res.send(html);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoint para buscar logs (usado pelo frontend)
app.get('/api/logs/notifications', (req, res) => {
    try {
        res.json({
            success: true,
            logs: notificationLogs.slice().reverse(), // Mais recentes primeiro
            count: notificationLogs.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoint para limpar logs
app.post('/api/logs/notifications/clear', (req, res) => {
    try {
        notificationLogs.length = 0; // Limpar array
        addNotificationLog('info', 'Logs limpos manualmente via interface web');
        res.json({ success: true, message: 'Logs limpos com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sistema para rastrear mensagens pendentes de confirmação
const pendingConfirmations = new Map(); // { phoneNumber: { count: 0, eventTime: "X horas", maxMessages: 2 } }

// Função para gerar protocolo único
function generateProtocol() {
    return `PROT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Endpoint para testar sistema de confirmação por texto
app.post('/test-button', async (req, res) => {
    const { to } = req.body;
    const defaultSession = userSessions.get(defaultUserId);

    if (!defaultSession || !defaultSession.sock || !defaultSession.isReady) {
        return res.json({
            success: false,
            error: 'WhatsApp não está conectado'
        });
    }

    try {
        let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        // 1. PRIMEIRO ENVIO: Mensagem de texto prévia
        await defaultSession.sock.sendMessage(jid, {
            text: "Olá, segue sua notificação."
        });

        console.log('✅ Primeira mensagem enviada');

        // 2. DELAY antes do segundo envio
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos

        // 3. SEGUNDO ENVIO: Mensagem pedindo confirmação por texto
        const currentTime = new Date();
        const eventTime = `${currentTime.getHours()}:${currentTime.getMinutes().toString().padStart(2, '0')}`;

        await defaultSession.sock.sendMessage(jid, {
            text: `Olá, faltam 30 minutos para nossa call!\nPor aqui já está tudo pronto.\nEm breve iremos te enviar o link pelo WhatsApp. Nos vemos em breve. 🫡\n\n📱 *Responda "OK" para confirmar sua presença.*`
        });

        // Registrar que estamos aguardando confirmação desta pessoa
        pendingConfirmations.set(jid, {
            count: 0,
            eventTime: eventTime,
            maxMessages: 2
        });

        console.log(`✅ Segunda mensagem enviada. Aguardando confirmação de: ${jid}`);

        res.json({
            success: true,
            message: 'Sequência completa enviada com sucesso!',
            eventTime: eventTime,
            awaitingConfirmation: true
        });
    } catch (error) {
        console.error('Erro ao enviar sequência:', error);
        res.json({ success: false, error: error.message });
    }
});

// Função para gerar PDF de leads
async function generateLeadsPDF(weeklyOnly = false) {
    try {
        console.log(`📊 Gerando PDF de leads ${weeklyOnly ? 'semanal' : 'geral'}...`);

        let query = supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        // Se for semanal, filtrar apenas da última semana
        if (weeklyOnly) {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            query = query.gte('created_at', oneWeekAgo.toISOString());
        }

        const { data: leads, error } = await query;

        if (error) {
            console.error('Erro ao buscar leads:', error);
            return null;
        }

        console.log(`📋 ${leads.length} leads encontrados`);

        // Gerar PDF usando puppeteer
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        const reportType = weeklyOnly ? 'Semanal' : 'Geral';
        const reportDate = new Date().toLocaleDateString('pt-BR');

        // HTML para o PDF
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; }
                .title { color: #166534; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                .subtitle { color: #666; font-size: 14px; }
                .info { background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; }
                .lead { margin: 15px 0; padding: 15px; border-left: 4px solid #16a34a; background: #fafafa; }
                .lead-name { font-weight: bold; color: #166534; margin-bottom: 5px; }
                .lead-info { font-size: 12px; color: #666; margin: 3px 0; }
                .separator { border-bottom: 2px solid #d4af37; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">RELATORIO DE LEADS - ${reportType.toUpperCase()}</div>
                <div class="subtitle">Data: ${reportDate}</div>
            </div>

            <div class="separator"></div>

            <div class="info">
                <strong>Total de leads: ${leads.length}</strong><br>
                ${weeklyOnly ? `Periodo: ${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('pt-BR')} - ${reportDate}` : 'Relatorio geral de todos os leads'}
            </div>

            ${leads.length === 0 ?
                '<div class="info">Nenhum lead encontrado no periodo.</div>' :
                leads.map((lead, index) => `
                    <div class="lead">
                        <div class="lead-name">${index + 1}. ${lead.nome_completo}</div>
                        <div class="lead-info">Origem: ${lead.origem || 'Nao informado'}</div>
                        <div class="lead-info">Status: ${lead.status}</div>
                        ${lead.observacoes ? `<div class="lead-info">Observacoes: ${lead.observacoes}</div>` : ''}
                        <div class="lead-info">Cadastrado: ${new Date(lead.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                `).join('')
            }
        </body>
        </html>
        `;

        await page.setContent(htmlContent);
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                bottom: '20px',
                left: '20px',
                right: '20px'
            }
        });

        await browser.close();

        const filename = `leads_${weeklyOnly ? 'semanal' : 'geral'}_${new Date().toISOString().split('T')[0]}.pdf`;

        return {
            buffer: pdfBuffer,
            filename,
            leadsCount: leads.length,
            reportType
        };

    } catch (error) {
        console.error('Erro ao gerar PDF de leads:', error);
        return null;
    }
}

// Função para enviar PDF por WhatsApp
async function sendLeadsPDFToWhatsApp(phoneNumber, weeklyOnly = false) {
    try {
        const session = getSession(defaultUserId);
        if (!session || !session.isReady || !session.sock) {
            console.log('❌ WhatsApp não está conectado');
            return false;
        }

        const pdfData = await generateLeadsPDF(weeklyOnly);
        if (!pdfData) {
            console.log('❌ Erro ao gerar PDF de leads');
            return false;
        }

        // Formatar número para WhatsApp
        const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

        // Primeiro enviar mensagem explicativa
        const message = `📊 *RELATÓRIO DE LEADS - ${pdfData.reportType.toUpperCase()}*\n\n` +
                       `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n` +
                       `📋 Total de leads: ${pdfData.leadsCount}\n\n` +
                       `${weeklyOnly ? '📊 Leads cadastrados na última semana' : '📊 Relatório geral de todos os leads'}\n\n` +
                       `Arquivo PDF anexo com detalhes completos 👇`;

        await session.sock.sendMessage(jid, { text: message });

        // Depois enviar o arquivo PDF
        await session.sock.sendMessage(jid, {
            document: pdfData.buffer,
            fileName: pdfData.filename,
            mimetype: 'application/pdf'
        });

        console.log(`✅ PDF de leads ${pdfData.reportType} enviado para ${phoneNumber}`);

        addNotificationLog('success', `PDF de leads ${pdfData.reportType} enviado via WhatsApp`, {
            destinatario: phoneNumber,
            leadsCount: pdfData.leadsCount,
            tipo: pdfData.reportType,
            arquivo: pdfData.filename
        });

        return true;

    } catch (error) {
        console.error('Erro ao enviar PDF por WhatsApp:', error);
        addNotificationLog('error', 'Erro ao enviar PDF de leads via WhatsApp', { error: error.message });
        return false;
    }
}

// Endpoint para enviar PDF de leads manualmente
app.post('/send-leads-pdf', async (req, res) => {
    try {
        const { phone, weekly = false } = req.body;

        if (!phone) {
            return res.json({ success: false, error: 'Número de telefone é obrigatório' });
        }

        const success = await sendLeadsPDFToWhatsApp(phone, weekly);

        res.json({
            success,
            message: success ? 'Relatório enviado com sucesso' : 'Erro ao enviar relatório'
        });
    } catch (error) {
        console.error('Erro no endpoint send-leads-pdf:', error);
        res.json({ success: false, error: error.message });
    }
});

// Configurar job semanal para envio de PDF
function setupLeadsPDFJobs() {
    // Job semanal: toda sexta às 12h
    cron.schedule('0 12 * * 5', async () => {
        console.log('⏰ Executando envio semanal de relatório de leads...');

        // Enviar para os dois números
        const destinatarios = ['5541998973032', '5583996910414'];

        for (const numero of destinatarios) {
            try {
                await sendLeadsPDFToWhatsApp(numero, true); // Semanal
                console.log(`✅ Relatório semanal enviado para ${numero}`);
            } catch (error) {
                console.error(`❌ Erro ao enviar para ${numero}:`, error);
            }
        }
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });

    console.log('📊 Job de relatório de leads configurado: Sextas às 12h para +5541998973032 e +5583996910414');
}

// ===== ROTAS PARA MENSAGENS AUTOMÁTICAS =====

// Listar mensagens automáticas
app.get('/auto-messages', async (req, res) => {
    try {
        const { data: autoMessages, error } = await supabase
            .from('auto_messages')
            .select('*, user_id')
            .order('scheduled_time');

        if (error) {
            console.error('❌ Erro ao buscar mensagens automáticas:', error);
            return res.json({ success: false, error: 'Erro ao buscar mensagens automáticas' });
        }

        res.json({ success: true, data: autoMessages });
    } catch (error) {
        console.error('❌ Erro interno ao buscar mensagens automáticas:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Criar nova mensagem automática
app.post('/auto-messages', async (req, res) => {
    try {
        const { message, scheduledTime, targetGroup, photoUrl, photoCaption } = req.body;

        if (!scheduledTime || !targetGroup) {
            return res.json({
                success: false,
                error: 'Dados obrigatórios: scheduledTime, targetGroup'
            });
        }

        if (!message && !photoUrl) {
            return res.json({
                success: false,
                error: 'É necessário ter pelo menos uma mensagem de texto ou foto'
            });
        }

        const { data, error } = await supabase
            .from('auto_messages')
            .insert([{
                message: message,
                scheduled_time: scheduledTime,
                target_group: targetGroup,
                is_active: true,
                photo_url: photoUrl || null,
                photo_caption: photoCaption || null
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar mensagem automática:', error);
            return res.json({ success: false, error: 'Erro ao criar mensagem automática' });
        }

        console.log('✅ Nova mensagem automática criada:', data.id);
        res.json({ success: true, data: data });
    } catch (error) {
        console.error('❌ Erro interno ao criar mensagem automática:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Salvar múltiplas mensagens automáticas
app.post('/auto-messages/bulk', async (req, res) => {
    try {
        const { autoMessages } = req.body;

        console.log('🔍 DEBUG - Dados recebidos no backend:', JSON.stringify(req.body, null, 2));
        console.log('🔍 DEBUG - autoMessages:', JSON.stringify(autoMessages, null, 2));

        if (!autoMessages || !Array.isArray(autoMessages)) {
            return res.json({
                success: false,
                error: 'Dados obrigatórios: autoMessages (array)'
            });
        }

        // Primeiro, limpar mensagens existentes (opcional - pode ser modificado)
        await supabase.from('auto_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Filtrar apenas mensagens válidas
        const validMessages = autoMessages.filter(msg =>
            msg.message && msg.scheduled_time && msg.target_group
        ).map(msg => ({
            message: msg.message,
            scheduled_time: msg.scheduled_time,
            scheduled_date: msg.scheduled_date || null,
            target_group: msg.target_group,
            photo_url: msg.photo_url || null,
            photo_caption: msg.photo_caption || null,
            is_active: true
        }));

        console.log('🔍 DEBUG - validMessages que serão inseridas:', JSON.stringify(validMessages, null, 2));

        if (validMessages.length === 0) {
            return res.json({
                success: false,
                error: 'Nenhuma mensagem válida encontrada'
            });
        }

        const { data, error } = await supabase
            .from('auto_messages')
            .insert(validMessages)
            .select();

        if (error) {
            console.error('❌ Erro ao salvar mensagens automáticas:', error);
            return res.json({ success: false, error: 'Erro ao salvar mensagens automáticas' });
        }

        console.log(`✅ ${data.length} mensagens automáticas salvas`);
        res.json({
            success: true,
            data: data,
            message: `${data.length} mensagens automáticas configuradas com sucesso!`
        });
    } catch (error) {
        console.error('❌ Erro interno ao salvar mensagens automáticas:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Atualizar mensagem automática
app.put('/auto-messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { message, scheduledTime, targetGroup, isActive } = req.body;

        const updates = {};
        if (message !== undefined) updates.message = message;
        if (scheduledTime !== undefined) updates.scheduled_time = scheduledTime;
        if (targetGroup !== undefined) updates.target_group = targetGroup;
        if (isActive !== undefined) updates.is_active = isActive;

        const { data, error } = await supabase
            .from('auto_messages')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao atualizar mensagem automática:', error);
            return res.json({ success: false, error: 'Erro ao atualizar mensagem automática' });
        }

        console.log('✅ Mensagem automática atualizada:', id);
        res.json({ success: true, data: data });
    } catch (error) {
        console.error('❌ Erro interno ao atualizar mensagem automática:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Deletar mensagem automática
app.delete('/auto-messages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('auto_messages')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ Erro ao deletar mensagem automática:', error);
            return res.json({ success: false, error: 'Erro ao deletar mensagem automática' });
        }

        console.log('✅ Mensagem automática deletada:', id);
        res.json({ success: true, message: 'Mensagem automática deletada com sucesso' });
    } catch (error) {
        console.error('❌ Erro interno ao deletar mensagem automática:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Logs de mensagens automáticas
app.get('/auto-messages/logs', async (req, res) => {
    try {
        const { data: logs, error } = await supabase
            .from('auto_message_logs')
            .select(`
                *,
                auto_messages (
                    message,
                    scheduled_time,
                    target_group
                )
            `)
            .order('sent_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('❌ Erro ao buscar logs de mensagens automáticas:', error);
            return res.json({ success: false, error: 'Erro ao buscar logs' });
        }

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('❌ Erro interno ao buscar logs:', error);
        res.json({ success: false, error: 'Erro interno do servidor' });
    }
});

// Função para verificar e enviar mensagens automáticas
async function checkAndSendAutoMessages() {
    try {
        console.log('🔄 Verificando mensagens automáticas para envio...');

        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM
        const currentDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

        // Buscar mensagens que devem ser enviadas agora
        const { data: autoMessages, error } = await supabase
            .from('auto_messages')
            .select('*')
            .eq('is_active', true)
            .eq('scheduled_time', currentTime)
            .or(`scheduled_date.is.null,scheduled_date.eq.${currentDate}`);

        if (error) {
            console.error('❌ Erro ao buscar mensagens automáticas:', error);
            return;
        }

        if (!autoMessages || autoMessages.length === 0) {
            console.log('ℹ️ Nenhuma mensagem automática para enviar neste horário');
            return;
        }

        console.log(`📬 Encontradas ${autoMessages.length} mensagens para enviar`);

        for (const autoMessage of autoMessages) {
            try {
                // Verificar se já foi enviada hoje
                const { data: sentToday, error: logError } = await supabase
                    .from('auto_message_logs')
                    .select('id')
                    .eq('auto_message_id', autoMessage.id)
                    .gte('sent_at', `${currentDate}T00:00:00`);

                if (logError) {
                    console.error('❌ Erro ao verificar logs:', logError);
                    continue;
                }

                if (sentToday && sentToday.length > 0) {
                    console.log(`⏭️ Mensagem ${autoMessage.id} já foi enviada hoje`);
                    continue;
                }

                // Enviar mensagem
                const userId = (autoMessage.user_id && autoMessage.user_id !== null) ? autoMessage.user_id : 'default';
                const session = userSessions.get(userId);

                console.log(`🔍 DEBUG - userId: ${userId}`);
                console.log(`🔍 DEBUG - session exists: ${!!session}`);
                console.log(`🔍 DEBUG - session.sock exists: ${!!(session && session.sock)}`);

                if (!session || !session.sock) {
                    console.log(`⚠️ Sessão não encontrada para usuário ${userId}`);
                    continue;
                }

                // Determinar JID correto (grupo ou número individual)
                let targetJid = autoMessage.target_group;
                console.log(`🔍 DEBUG - target_group original: "${targetJid}"`);

                // Se não tem @, adicionar sufixo apropriado
                if (!targetJid.includes('@')) {
                    // Se tem mais de 10 dígitos, provavelmente é número individual
                    if (targetJid.length > 10) {
                        targetJid = `${targetJid}@s.whatsapp.net`;
                    } else {
                        targetJid = `${targetJid}@g.us`;
                    }
                }

                console.log(`🔍 DEBUG - targetJid final: "${targetJid}"`);
                console.log(`🔍 DEBUG - message: "${autoMessage.message}"`);
                console.log(`🔍 DEBUG - photo_url: "${autoMessage.photo_url}"`);

                // Determinar tipo de mensagem
                let messageContent = {};

                if (autoMessage.photo_url) {
                    // Mensagem com foto
                    messageContent = {
                        image: { url: autoMessage.photo_url },
                        caption: autoMessage.photo_caption || autoMessage.message || ''
                    };
                } else {
                    // Mensagem só texto
                    messageContent = {
                        text: autoMessage.message
                    };
                }

                await session.sock.sendMessage(targetJid, messageContent);

                // Registrar log de envio
                await supabase
                    .from('auto_message_logs')
                    .insert({
                        auto_message_id: autoMessage.id,
                        sent_at: new Date().toISOString(),
                        status: 'sent',
                        target_group: autoMessage.target_group
                    });

                const isGroup = targetJid.includes('@g.us');
                console.log(`✅ Mensagem automática enviada para ${isGroup ? 'grupo' : 'número'} ${targetJid}`);

            } catch (sendError) {
                console.error(`❌ Erro ao enviar mensagem automática ${autoMessage.id}:`, sendError);

                // Registrar log de erro
                await supabase
                    .from('auto_message_logs')
                    .insert({
                        auto_message_id: autoMessage.id,
                        sent_at: new Date().toISOString(),
                        status: 'failed',
                        target_group: autoMessage.target_group,
                        error_message: sendError.message
                    });
            }
        }

    } catch (error) {
        console.error('❌ Erro na verificação de mensagens automáticas:', error);
    }
}

// Configurar cron job para verificar mensagens automáticas a cada minuto
cron.schedule('* * * * *', checkAndSendAutoMessages);

// ⭐ ENDPOINTS para resolver @lid manualmente
app.post('/resolve-lid', async (req, res) => {
    try {
        const { lidId, userId } = req.body;
        
        if (!lidId) {
            return res.json({ 
                success: false, 
                error: 'lidId é obrigatório' 
            });
        }
        
        console.log(`🔍 Tentando resolver ${lidId}...`);
        
        // Usar session específica se fornecida
        const session = userId ? userSessions.get(userId) : null;
        
        // Usar todas as soluções implementadas
        const realNumber = await extractRealPhoneNumber(null, lidId, session);
        
        if (realNumber) {
            res.json({
                success: true,
                lidId: lidId,
                realNumber: realNumber,
                message: `LID resolvido com sucesso: ${lidId} → ${realNumber}`
            });
        } else {
            res.json({
                success: false,
                lidId: lidId,
                error: 'Não foi possível resolver o LID para número real',
                suggestions: [
                    'Verifique se a pessoa enviou mensagem em grupo (participant)',
                    'Aguarde a pessoa enviar nova mensagem',
                    'Verifique se existe no banco de dados'
                ]
            });
        }
        
    } catch (error) {
        console.error('❌ Erro no endpoint resolve-lid:', error);
        res.json({ 
            success: false, 
            error: 'Erro interno ao resolver LID' 
        });
    }
});

// Endpoint para ver todos os mapeamentos salvos
app.get('/lid-mappings', async (req, res) => {
    try {
        // Mostrar cache em memória
        const cacheMapping = {};
        lidToPhoneMap.forEach((phone, lid) => {
            cacheMapping[lid] = phone;
        });
        
        // Buscar do banco de dados
        const { data: dbMappings, error } = await supabase
            .from('lid_phone_mappings')
            .select('*')
            .order('updated_at', { ascending: false });
            
        res.json({
            success: true,
            cache: cacheMapping,
            database: dbMappings || [],
            total_cache: lidToPhoneMap.size,
            total_database: dbMappings?.length || 0
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar mapeamentos:', error);
        res.json({ 
            success: false, 
            error: 'Erro ao buscar mapeamentos' 
        });
    }
});

app.listen(port, async () => {
    console.log(`🚀 WhatsApp Multi-User Baileys API rodando em https://api.medicosderesultado.com.br`);
    console.log(`👥 Sistema preparado para múltiplos usuários`);
    console.log(`📱 Acesse https://api.medicosderesultado.com.br para ver o status`);
    console.log(`🔧 Endpoints: /users/{userId}/register para registrar novos usuários`);
    console.log(`🎯 Resolver LID: POST /resolve-lid, GET /lid-mappings`);

    // Configurar jobs após 10 segundos (dar tempo para sessões conectarem)
    setTimeout(() => {
        addNotificationLog('success', 'Sistema de notificações WhatsApp iniciado com sucesso', {
            port,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
        setupCronJobs();
        setupLeadsPDFJobs();
    }, 10000);
});