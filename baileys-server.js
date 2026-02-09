const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: ['http://localhost:3000', 'https://api.medicosderesultado.com.br'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
})); // CORS habilitado para localhost:3000
app.use(express.json());

let sock;
let qrCodeData = null;
let isReady = false;
let isConnecting = false;
let contacts = [];
let messagesList = [];
let chatMessages = new Map(); // Map para armazenar mensagens por chat
let allChats = []; // Lista de todos os chats/conversas

// Configuração do Supabase
const supabase = createClient(
    'https://udzmlnnztzzwrphhizol.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU'
);

// Função para obter horário de São Paulo
function getSaoPauloTime() {
    return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Storage para mapear @lid para números reais encontrados
const lidToPhoneMap = new Map();

// Função para extrair números reais de várias propriedades - VERSÃO AVANÇADA
async function extractRealPhoneNumber(contact, chatId) {
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
    
    // 4. Procurar mensagens anteriores desta pessoa com número real
    if (possibleNumbers.length === 0 && chatId) {
        const realNumber = findRealNumberInHistory(chatId);
        if (realNumber) {
            lidToPhoneMap.set(chatId, realNumber);
            await saveLidMappingToDatabase(chatId, realNumber);
            return realNumber;
        }
    }
    
    // ⭐ PRIORIDADE 5: Tentar resolver via API do WhatsApp
    if (possibleNumbers.length === 0 && chatId && chatId.includes('@lid')) {
        const apiNumber = await resolveLidViaAPI(chatId);
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

// ⭐ SOLUÇÃO 2: Resolver @lid usando API do WhatsApp
async function resolveLidViaAPI(lidId) {
    try {
        console.log(`🔍 Tentando resolver ${lidId} via API...`);
        
        // Tentar endpoint de contatos
        if (sock && sock.onWhatsApp) {
            const result = await sock.onWhatsApp(lidId);
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
        if (sock && sock.fetchContact) {
            const contactInfo = await sock.fetchContact(lidId);
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

// Função para procurar número real no histórico de mensagens
function findRealNumberInHistory(lidId) {
    try {
        // Procurar nas mensagens se existe alguma da mesma pessoa mas com @s.whatsapp.net
        for (const message of messagesList) {
            if (message.contact && message.contact.id && message.contact.id.includes('@s.whatsapp.net')) {
                // Verificar se é a mesma pessoa comparando pushName ou outras propriedades
                const msgFromLid = messagesList.find(m => 
                    m.contact.id === lidId && 
                    m.contact.pushname && 
                    message.contact.pushname &&
                    m.contact.pushname.toLowerCase() === message.contact.pushname.toLowerCase()
                );
                
                if (msgFromLid) {
                    return message.contact.id.replace('@s.whatsapp.net', '');
                }
            }
        }
    } catch (error) {
        console.log('Erro ao procurar número no histórico:', error.message);
    }
    return null;
}

// Função para limpar número de telefone de sufixos WhatsApp e extrair número real
async function cleanPhoneNumber(phoneId, contact = null) {
    if (!phoneId) return '';
    
    // Se é @lid, tentar extrair número real primeiro usando TODAS as soluções
    if (phoneId.includes('@lid')) {
        const realNumber = await extractRealPhoneNumber(contact, phoneId);
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

// Caminhos para persistência local
const DATA_DIR = path.join(__dirname, 'auth_info_baileys');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

// Funções de persistência
function saveData(filePath, data) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`❌ Erro ao salvar ${path.basename(filePath)}:`, error);
    }
}

function loadData(filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`❌ Erro ao carregar ${path.basename(filePath)}:`, error);
    }
    return defaultValue;
}

// Salvar dados automaticamente
function saveChats() {
    saveData(CHATS_FILE, allChats);
}

function saveMessages() {
    // Converte Map para Object para serialização
    const messagesObj = {};
    for (const [key, value] of chatMessages.entries()) {
        messagesObj[key] = value;
    }
    saveData(MESSAGES_FILE, messagesObj);
}

function saveContacts() {
    saveData(CONTACTS_FILE, contacts);
}

// Carregar dados na inicialização
function loadPersistedData() {
    console.log('📂 Carregando dados salvos...');

    allChats = loadData(CHATS_FILE, []);
    console.log(`✅ ${allChats.length} chats carregados`);

    contacts = loadData(CONTACTS_FILE, []);
    console.log(`✅ ${contacts.length} contatos carregados`);

    const savedMessages = loadData(MESSAGES_FILE, {});
    for (const [key, value] of Object.entries(savedMessages)) {
        chatMessages.set(key, value);
    }
    console.log(`✅ Mensagens de ${Object.keys(savedMessages).length} chats carregados`);
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WA v${version.join('.')}, é a mais recente: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatsApp API', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📱 QR Code recebido');
            isConnecting = true;
            isReady = false;

            try {
                qrCodeData = await QRCode.toDataURL(qr);
                console.log('✅ QR Code convertido para imagem');
            } catch (err) {
                console.error('❌ Erro ao gerar QR Code:', err);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexão fechada devido a:', lastDisconnect?.error);

            isReady = false;
            isConnecting = false;
            qrCodeData = null;

            if (shouldReconnect) {
                console.log('🔄 Tentando reconectar...');
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!');
            isReady = true;
            isConnecting = false;
            qrCodeData = null;

            // Aguardar um pouco para a inicialização completa
            setTimeout(async () => {
                try {
                    // Forçar sincronização inicial
                    await sock.sendMessage(sock.user.id, { text: '.' });
                    console.log('✅ Sincronização inicial enviada');
                } catch (error) {
                    console.log('ℹ️ Erro na sincronização:', error.message);
                }

                // Carregar chats e contatos após inicialização
                await loadAllChats();
            }, 2000);
        } else if (connection === 'connecting') {
            console.log('⏳ Conectando...');
            isConnecting = true;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];

        if (!message.message) return;

        // Ignorar apenas mensagens de status/stories
        if (message.key.remoteJid === 'status@broadcast') return;
        
        // Debug e extração avançada para @lid
        if (message.key.remoteJid && message.key.remoteJid.includes('@lid')) {
            console.log('🔍 DEBUG @lid detectado:', {
                remoteJid: message.key.remoteJid,
                participant: message.key.participant, // ⭐ ESTA É A CHAVE!
                pushName: message.pushName,
                notify: message.notify,
                verifiedName: message.verifiedName,
                fromMe: message.key.fromMe,
                allProperties: Object.keys(message),
                messageKey: message.key
            });
            
            // ⭐ SOLUÇÃO 1: Verificar participant (principalmente em grupos)
            if (message.key.participant && message.key.participant.includes('@s.whatsapp.net')) {
                const realNumber = message.key.participant.replace('@s.whatsapp.net', '');
                console.log(`🎯 NÚMERO REAL ENCONTRADO no participant: ${realNumber}`);
                
                // Salvar mapeamento no cache
                lidToPhoneMap.set(message.key.remoteJid, realNumber);
                
                // ⭐ SOLUÇÃO 3: Salvar no BD para próximas vezes
                saveLidMappingToDatabase(message.key.remoteJid, realNumber);
            }
        }

        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const messageText = message.message.conversation ||
                           message.message.extendedTextMessage?.text || '';

        // Determinar nome do chat/contato
        let chatName = message.pushName || chatId;
        if (isGroup) {
            // Para grupos, tentar obter info do grupo
            try {
                const groupMetadata = await sock.groupMetadata(chatId);
                chatName = groupMetadata.subject || chatName;
            } catch (error) {
                console.log('❌ Erro ao obter metadata do grupo:', error);
            }
        }

        // Armazenar mensagem
        const messageObj = {
            id: message.key.id,
            from: chatId,
            to: chatId,
            body: messageText,
            type: 'text',
            timestamp: Date.now(),
            isFromMe: message.key.fromMe,
            contact: {
                id: chatId,
                name: chatName,
                pushname: message.pushName || '',
                number: isGroup ? chatId : cleanPhoneNumber(chatId, message)
            }
        };

        messagesList.unshift(messageObj);
        if (messagesList.length > 100) messagesList.pop(); // Manter apenas 100 mensagens

        // Armazenar mensagem por chat
        if (!chatMessages.has(chatId)) {
            chatMessages.set(chatId, []);
        }
        const chatMsgs = chatMessages.get(chatId);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop(); // Manter 50 mensagens por chat

        // Auto-adicionar contato quando alguém manda mensagem (se não for grupo)
        if (!message.key.fromMe && !isGroup) {
            const existingContact = contacts.find(c => c.id === chatId);
            if (!existingContact) {
                const newContact = {
                    id: chatId,
                    name: message.pushName || cleanPhoneNumber(chatId, message),
                    pushname: message.pushName || '',
                    number: cleanPhoneNumber(chatId, message),
                    isMyContact: true
                };
                contacts.push(newContact);
                console.log('👤 Novo contato adicionado automaticamente:', newContact.name);
                saveContacts();
                // Notificar clientes sobre novo contato via SSE
                sendEventToClients('contacts_updated', contacts);
            }
        }

        // Atualizar ou criar chat na lista
        const existingChatIndex = allChats.findIndex(c => c.id === chatId);
        const chatData = {
            id: chatId,
            name: chatName,
            isGroup: isGroup,
            lastMessage: {
                body: messageText,
                timestamp: Date.now(),
                isFromMe: message.key.fromMe
            },
            unreadCount: message.key.fromMe ? 0 : (existingChatIndex >= 0 ? (allChats[existingChatIndex].unreadCount || 0) + 1 : 1),
            timestamp: Date.now()
        };

        if (existingChatIndex >= 0) {
            allChats[existingChatIndex] = chatData;
        } else {
            allChats.unshift(chatData);
        }

        // Ordenar chats por timestamp (mais recente primeiro)
        allChats.sort((a, b) => b.timestamp - a.timestamp);

        // Salvar dados
        saveMessages();
        saveChats();

        // Notificar clientes sobre nova mensagem via SSE
        sendEventToClients('new_message', messageObj);
        sendEventToClients('chats_updated', allChats);

        // Enviar evento específico para atualização do chat messages se for o chat ativo
        sendEventToClients('chat_message_update', {
            chatId: chatId,
            message: messageObj
        });

        if (!message.key.fromMe) {
            const groupInfo = isGroup ? ` no grupo "${chatName}"` : '';
            console.log('=============================');
            console.log(`📨 MENSAGEM RECEBIDA${groupInfo}:`);
            console.log('De:', message.key.remoteJid);
            console.log('Texto:', messageText);
            console.log('=============================');

            // Comando agenda direto
            if (messageText.toLowerCase().trim() === 'agenda') {
                try {
                    console.log('📅 Comando agenda detectado...');
                    
                    // Buscar organização do usuário
                    const phoneNumber = message.key.remoteJid;
                    const organization = await getUserOrganization(phoneNumber);
                    
                    if (!organization) {
                        await sock.sendMessage(message.key.remoteJid, { 
                            text: '❌ Você não faz parte de uma organização autorizada para usar este comando.' 
                        });
                        return;
                    }

                    // Buscar eventos da organização
                    const events = await getEventsForOrganization(organization.id);
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

                    await sock.sendMessage(message.key.remoteJid, { text: response });
                    console.log('✅ Programação do dia enviada!');
                } catch (error) {
                    console.error('❌ Erro ao enviar programação:', error);
                }
            }

            // Remover lógica das opções 1-6
            else if (false && /^[1-6]$/.test(messageText.toLowerCase().trim())) {
                try {
                    // Buscar organização do usuário
                    const phoneNumber = message.key.remoteJid;
                    const organization = await getUserOrganization(phoneNumber);
                    
                    if (!organization) {
                        await sock.sendMessage(message.key.remoteJid, { 
                            text: '❌ Você não faz parte de uma organização autorizada para usar este comando.' 
                        });
                        return;
                    }

                    // Buscar eventos da organização
                    const events = await getEventsForOrganization(organization.id);
                    let response = '';

                    if (!events || events.length === 0) {
                        response = '✅ Nenhum compromisso agendado para hoje.';
                    } else {
                        switch (msgLower.trim()) {
                            case '1': // Horários
                                response = '🕐 *Horários das Reuniões de Hoje:*\n\n';
                                events.forEach(event => {
                                    const eventStart = new Date(event.start_datetime);
                                    const timeStr = eventStart.toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'America/Sao_Paulo'
                                    });
                                    response += `• ${timeStr} - ${event.title}\n`;
                                });
                                break;
                            case '2': // Participantes
                                response = '👥 *Participantes das Reuniões:*\n\n';
                                events.forEach(event => {
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
                                    response += `• ${timeStr} - ${participantName}\n`;
                                });
                                break;
                            case '3': // Links
                                response = '🔗 *Links de Acesso:*\n\n';
                                events.forEach(event => {
                                    const eventStart = new Date(event.start_datetime);
                                    const timeStr = eventStart.toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'America/Sao_Paulo'
                                    });
                                    const link = event.description && event.description.includes('http') ? 
                                        event.description.match(/https?:\/\/[^\s]+/)?.[0] || 'Link não informado' : 
                                        'Link não informado';
                                    response += `• ${timeStr} - ${link}\n`;
                                });
                                break;
                            case '4': // Programação completa
                                response = '📋 *Programação Completa de Hoje:*\n\n';
                                events.forEach(event => {
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
                                    
                                    response += `🕐 **${timeStartStr}-${timeEndStr}** | ${event.title}\n`;
                                    response += `👥 ${participantName}\n`;
                                    if (event.description) {
                                        response += `📝 ${event.description}\n`;
                                    }
                                    response += '\n';
                                });
                                break;
                            case '5': // Locais
                                response = '📍 *Locais das Reuniões:*\n\n';
                                events.forEach(event => {
                                    const eventStart = new Date(event.start_datetime);
                                    const timeStr = eventStart.toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'America/Sao_Paulo'
                                    });
                                    const isOnline = event.description && (
                                        event.description.includes('meet.') || 
                                        event.description.includes('zoom') || 
                                        event.description.includes('teams') ||
                                        event.description.includes('http')
                                    );
                                    const location = isOnline ? 'Online' : 'Presencial';
                                    response += `• ${timeStr} - ${location}\n`;
                                });
                                break;
                            case '6': // Próxima reunião
                                const nextEvent = events[0]; // Primeiro evento (já ordenado por horário)
                                if (nextEvent) {
                                    const eventStart = new Date(nextEvent.start_datetime);
                                    const timeStr = eventStart.toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'America/Sao_Paulo'
                                    });
                                    
                                    let participantName = 'Participante não identificado';
                                    if (nextEvent.mentorados && nextEvent.mentorados.nome_completo) {
                                        participantName = nextEvent.mentorados.nome_completo + ' (Mentorado)';
                                    } else if (nextEvent.leads && nextEvent.leads.nome_completo) {
                                        participantName = nextEvent.leads.nome_completo + ' (Lead)';
                                    }
                                    
                                    const now = new Date();
                                    const timeDiff = eventStart.getTime() - now.getTime();
                                    const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
                                    const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                                    
                                    response = `⏰ *Próxima Reunião:*\n\n📅 **Hoje às ${timeStr}**\n🎯 ${nextEvent.title}\n👥 ${participantName}`;
                                    
                                    if (timeDiff > 0) {
                                        if (hoursUntil > 0) {
                                            response += `\n⏳ Faltam ${hoursUntil}h e ${minutesUntil}min`;
                                        } else if (minutesUntil > 0) {
                                            response += `\n⏳ Faltam ${minutesUntil} minutos`;
                                        } else {
                                            response += `\n🔥 Começando agora!`;
                                        }
                                    } else {
                                        response += `\n⚠️ Já em andamento`;
                                    }
                                    
                                    if (nextEvent.description && nextEvent.description.includes('http')) {
                                        const link = nextEvent.description.match(/https?:\/\/[^\s]+/)?.[0];
                                        if (link) {
                                            response += `\n🔗 ${link}`;
                                        }
                                    }
                                } else {
                                    response = '⏰ *Próxima Reunião:*\n\n✅ Nenhuma reunião agendada para hoje.';
                                }
                                break;
                        }
                    }

                    await sock.sendMessage(message.key.remoteJid, { text: response });
                    console.log(`✅ Resposta da opção ${msgLower.trim()} enviada!`);
                } catch (error) {
                    console.error('❌ Erro ao enviar resposta da programação:', error);
                }
            }

            // Ping-pong original
            else if (messageText.toLowerCase().includes('ping')) {
                try {
                    console.log('🏓 Enviando pong...');
                    await sock.sendMessage(message.key.remoteJid, { text: 'pong' });
                    console.log('✅ Pong enviado!');
                } catch (error) {
                    console.error('❌ Erro ao enviar pong:', error);
                }
            }
        }
    });
}

// Função para carregar todos os chats (aba "Todas" do WhatsApp)
async function loadAllChats() {
    try {
        if (!sock || !isReady) return;

        console.log('💬 Carregando todos os chats...');
        allChats = [];

        // Buscar do store interno do Baileys
        const store = sock.store;
        if (store && store.chats) {
            const chatEntries = Object.entries(store.chats);
            console.log(`📱 ${chatEntries.length} chats encontrados no store`);

            for (const [chatId, chatData] of chatEntries) {
                // Filtrar apenas conversas individuais e grupos (não status/broadcast)
                if (chatId.includes('@s.whatsapp.net') || chatId.includes('@g.us')) {
                    if (chatId === 'status@broadcast') continue; // Pular status

                    // Buscar última mensagem do chat
                    const lastMessage = messagesList.find(msg =>
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

                    allChats.push(chat);
                }
            }
        }

        // Buscar chats também das mensagens já recebidas
        const uniqueChats = new Map();

        // Adicionar chats já encontrados
        allChats.forEach(chat => uniqueChats.set(chat.id, chat));

        // Adicionar chats das mensagens
        messagesList.forEach(message => {
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

        // Ordenar por timestamp da última mensagem (mais recente primeiro)
        allChats = Array.from(uniqueChats.values()).sort((a, b) =>
            (b.lastMessage?.timestamp || b.timestamp) - (a.lastMessage?.timestamp || a.timestamp)
        );

        console.log(`✅ ${allChats.length} chats carregados e ordenados`);

        // Carregar também contatos baseados nos chats
        await loadContactsFromChats();

    } catch (error) {
        console.error('❌ Erro ao carregar chats:', error);
    }
}

// Função para carregar contatos baseado nos chats
async function loadContactsFromChats() {
    const uniqueContacts = new Map();

    allChats.forEach(chat => {
        if (!chat.isGroup) { // Apenas contatos individuais
            uniqueContacts.set(chat.id, {
                id: chat.id,
                name: chat.name,
                pushname: chat.name,
                number: cleanPhoneNumber(chat.id),
                isMyContact: true
            });
        }
    });

    contacts = Array.from(uniqueContacts.values()).sort((a, b) =>
        (a.name || a.number).localeCompare(b.name || b.number)
    );

    console.log(`👥 ${contacts.length} contatos extraídos dos chats`);
}

// Função para carregar mensagens específicas de um chat
async function loadChatHistory(chatId, limit = 5) {
    try {
        if (!sock || !isReady) return [];

        console.log(`📖 Carregando histórico do chat: ${chatId}`);

        // Primeiro, buscar nas mensagens já armazenadas
        let messages = chatMessages.get(chatId) || [];

        // Se não temos mensagens suficientes, tentar buscar do store
        if (messages.length < limit) {
            const store = sock.store;
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

                // Remover duplicatas e ordenar por timestamp
                const uniqueMessages = new Map();
                messages.forEach(msg => uniqueMessages.set(msg.id, msg));
                messages = Array.from(uniqueMessages.values())
                    .sort((a, b) => b.timestamp - a.timestamp);

                // Atualizar cache
                chatMessages.set(chatId, messages);
            }
        }

        // Retornar apenas as mensagens mais recentes
        return messages.slice(0, limit);

    } catch (error) {
        console.error(`❌ Erro ao carregar histórico do chat ${chatId}:`, error);
        return [];
    }
}

// Função para carregar contatos (mantida para compatibilidade)
async function loadContacts() {
    try {
        if (!sock || !isReady) return;

        console.log('📱 Carregando contatos...');
        const uniqueContacts = new Map();

        // Método 1: Buscar contatos do store interno
        const store = sock.store;
        if (store && store.contacts) {
            for (const [id, contact] of Object.entries(store.contacts)) {
                if (id.includes('@s.whatsapp.net')) {
                    uniqueContacts.set(id, {
                        id: id,
                        name: contact.name || contact.notify || cleanPhoneNumber(id),
                        pushname: contact.notify || '',
                        number: cleanPhoneNumber(id),
                        isMyContact: true
                    });
                }
            }
            console.log(`📋 ${uniqueContacts.size} contatos do store interno`);
        }

        // Método 2: Buscar chats ativos
        try {
            const chats = await sock.getChats();
            chats.forEach(chat => {
                if (chat.id.includes('@s.whatsapp.net') && !chat.id.includes('g.us')) {
                    const id = chat.id;
                    if (!uniqueContacts.has(id)) {
                        uniqueContacts.set(id, {
                            id: id,
                            name: chat.name || cleanPhoneNumber(id),
                            pushname: chat.name || '',
                            number: cleanPhoneNumber(id),
                            isMyContact: true
                        });
                    }
                }
            });
            console.log(`💬 Total após adicionar chats: ${uniqueContacts.size}`);
        } catch (error) {
            console.log('ℹ️ getChats não disponível:', error.message);
        }

        // Método 3: Buscar contatos da agenda (se disponível)
        try {
            const phoneBook = await sock.getContacts();
            if (phoneBook && Array.isArray(phoneBook)) {
                phoneBook.forEach(contact => {
                    if (contact.id && contact.id.includes('@s.whatsapp.net')) {
                        uniqueContacts.set(contact.id, {
                            id: contact.id,
                            name: contact.name || contact.notify || cleanPhoneNumber(contact.id),
                            pushname: contact.notify || contact.pushname || '',
                            number: cleanPhoneNumber(contact.id),
                            isMyContact: true
                        });
                    }
                });
                console.log(`📞 Total após adicionar agenda: ${uniqueContacts.size}`);
            }
        } catch (error) {
            console.log('ℹ️ getContacts não disponível:', error.message);
        }

        // Método 4: Buscar de mensagens já recebidas/enviadas
        messagesList.forEach(message => {
            const contactId = message.from;
            if (contactId && contactId.includes('@s.whatsapp.net') && !uniqueContacts.has(contactId)) {
                uniqueContacts.set(contactId, {
                    id: contactId,
                    name: message.contact?.name || message.contact?.pushname || cleanPhoneNumber(contactId),
                    pushname: message.contact?.pushname || '',
                    number: cleanPhoneNumber(contactId),
                    isMyContact: true
                });
            }
        });

        contacts = Array.from(uniqueContacts.values()).sort((a, b) =>
            (a.name || a.number).localeCompare(b.name || b.number)
        );
        console.log(`✅ ${contacts.length} contatos totais carregados`);

        // Recarregar contatos automaticamente a cada 30 segundos quando conectado
        setTimeout(() => {
            if (isReady) loadContacts();
        }, 30000);

    } catch (error) {
        console.error('❌ Erro ao carregar contatos:', error);
    }
}

// Server-Sent Events - Lista de conexões ativas
const sseClients = new Set();

function sendEventToClients(eventType, data) {
    const message = `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(message);
        } catch (error) {
            // Remove cliente desconectado
            sseClients.delete(client);
        }
    });
}

// Endpoint para Server-Sent Events
app.get('/events', (req, res) => {
    // Configurar headers SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // 'Access-Control-Allow-Origin': '*', // Comentado - nginx gerencia CORS
        // 'Access-Control-Allow-Headers': 'Cache-Control' // Comentado - nginx gerencia CORS
    });

    // Adicionar cliente à lista
    sseClients.add(res);

    console.log(`📡 Novo cliente SSE conectado. Total: ${sseClients.size}`);

    // Enviar status inicial
    const initialData = {
        type: 'status',
        data: {
            isReady: isReady,
            isConnecting: isConnecting,
            hasQR: qrCodeData !== null,
            contactsCount: contacts.length,
            messagesCount: messagesList.length
        }
    };
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    // Remover cliente quando desconectar
    req.on('close', () => {
        sseClients.delete(res);
        console.log(`📡 Cliente SSE desconectado. Total: ${sseClients.size}`);
    });
});

// Rotas da API
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'WhatsApp Baileys API is running :)' });
});

app.get('/status', (req, res) => {
    res.json({
        success: true,
        data: {
            isReady: isReady,
            isConnecting: isConnecting,
            hasQR: qrCodeData !== null,
            contactsCount: contacts.length,
            messagesCount: messagesList.length
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

    if (!isReady || !sock) {
        return res.json({
            success: false,
            error: 'Cliente WhatsApp não está conectado'
        });
    }

    try {
        // Formatar número para formato WhatsApp
        let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: 'Mensagem enviada com sucesso' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.json({ success: false, error: 'Erro ao enviar mensagem' });
    }
});

app.get('/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const limitedMessages = messagesList.slice(0, limit);

    res.json({
        success: true,
        data: limitedMessages
    });
});

app.get('/contacts', (req, res) => {
    res.json({
        success: true,
        data: contacts
    });
});

app.post('/contacts/reload', async (req, res) => {
    try {
        if (!isReady || !sock) {
            return res.json({
                success: false,
                error: 'Cliente WhatsApp não está conectado'
            });
        }

        await loadAllChats(); // Recarregar chats e contatos
        res.json({
            success: true,
            message: `${allChats.length} chats e ${contacts.length} contatos recarregados`,
            chatsCount: allChats.length,
            contactsCount: contacts.length
        });
    } catch (error) {
        console.error('Erro ao recarregar contatos:', error);
        res.json({ success: false, error: 'Erro ao recarregar contatos' });
    }
});

// Endpoint para buscar todos os chats (aba "Todas" do WhatsApp)
app.get('/chats', (req, res) => {
    res.json({
        success: true,
        data: allChats,
        count: allChats.length
    });
});

// Endpoint para buscar histórico de um chat específico
app.get('/chats/:chatId/history', async (req, res) => {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    try {
        if (!isReady || !sock) {
            return res.json({
                success: false,
                error: 'Cliente WhatsApp não está conectado'
            });
        }

        const history = await loadChatHistory(decodeURIComponent(chatId), limit);
        res.json({
            success: true,
            data: history,
            count: history.length
        });
    } catch (error) {
        console.error(`Erro ao carregar histórico do chat ${chatId}:`, error);
        res.json({ success: false, error: 'Erro ao carregar histórico do chat' });
    }
});

app.get('/messages/:chatId', (req, res) => {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const chatMsgs = chatMessages.get(chatId) || [];
    const limitedChatMessages = chatMsgs.slice(0, limit);

    res.json({
        success: true,
        data: limitedChatMessages
    });
});

// Página HTML para mostrar QR Code
app.get('/', (req, res) => {
    if (isReady) {
        res.send(`
            <html>
                <head><title>WhatsApp Baileys API</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>✅ WhatsApp Conectado!</h1>
                    <p><strong>Usando Baileys - Mais estável!</strong></p>
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
                <head><title>WhatsApp Baileys QR Code</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>📱 Conecte seu WhatsApp</h1>
                    <p><strong>Usando Baileys - Mais confiável!</strong></p>
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
                <head><title>WhatsApp Baileys API</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>⏳ Carregando WhatsApp...</h1>
                    <p><strong>Iniciando Baileys...</strong></p>
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

// ===== ROTAS PARA MENSAGENS AUTOMÁTICAS =====

// Listar mensagens automáticas
app.get('/auto-messages', async (req, res) => {
    try {
        const { data: autoMessages, error } = await supabase
            .from('auto_messages')
            .select('*')
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
                user_id: 'default',
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
            is_active: true,
            user_id: 'default'
        }));

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

        if (!isReady || !sock) {
            console.log('⏸️ WhatsApp não conectado - pulando verificação de mensagens automáticas');
            return;
        }

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
                // Determinar JID correto (grupo ou número individual)
                let targetJid = autoMessage.target_group;

                // Se não tem @, adicionar sufixo apropriado
                if (!targetJid.includes('@')) {
                    // Se tem mais de 10 dígitos, provavelmente é número individual
                    if (targetJid.length > 10) {
                        targetJid = `${targetJid}@s.whatsapp.net`;
                    } else {
                        targetJid = `${targetJid}@g.us`;
                    }
                }

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

                await sock.sendMessage(targetJid, messageContent);

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

// ⭐ ENDPOINT para resolver @lid manualmente
app.post('/resolve-lid', async (req, res) => {
    try {
        const { lidId } = req.body;
        
        if (!lidId) {
            return res.json({ 
                success: false, 
                error: 'lidId é obrigatório' 
            });
        }
        
        console.log(`🔍 Tentando resolver ${lidId}...`);
        
        // Usar todas as soluções implementadas
        const realNumber = await extractRealPhoneNumber(null, lidId);
        
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
    console.log(`🚀 WhatsApp Baileys API rodando em http://localhost:${port}`);
    console.log(`📱 Acesse http://localhost:${port} para ver o QR Code`);
    console.log(`🔧 Usando Baileys - Mais estável que whatsapp-web.js`);

    // Conectar ao WhatsApp
    try {
        await connectToWhatsApp();
    } catch (error) {
        console.error('❌ Erro ao inicializar:', error);
    }
});