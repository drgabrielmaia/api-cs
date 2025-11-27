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

// app.use(cors()); // Comentado - nginx gerencia CORS
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

        // Ignorar mensagens de status/stories
        if (message.key.remoteJid === 'status@broadcast') return;

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
                number: isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')
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
                    name: message.pushName || chatId.replace('@s.whatsapp.net', ''),
                    pushname: message.pushName || '',
                    number: chatId.replace('@s.whatsapp.net', ''),
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

            if (messageText.toLowerCase().includes('ping')) {
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
                        name: chatData.name || chatId.replace('@s.whatsapp.net', '').replace('@g.us', ''),
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
                    name: message.contact?.name || message.contact?.pushname || chatId.replace('@s.whatsapp.net', '').replace('@g.us', ''),
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
                number: chat.id.replace('@s.whatsapp.net', ''),
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
                                number: msg.key.remoteJid?.replace('@s.whatsapp.net', '') || ''
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
                        name: contact.name || contact.notify || id.replace('@s.whatsapp.net', ''),
                        pushname: contact.notify || '',
                        number: id.replace('@s.whatsapp.net', ''),
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
                            name: chat.name || id.replace('@s.whatsapp.net', ''),
                            pushname: chat.name || '',
                            number: id.replace('@s.whatsapp.net', ''),
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
                            name: contact.name || contact.notify || contact.id.replace('@s.whatsapp.net', ''),
                            pushname: contact.notify || contact.pushname || '',
                            number: contact.id.replace('@s.whatsapp.net', ''),
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
                    name: message.contact?.name || message.contact?.pushname || contactId.replace('@s.whatsapp.net', ''),
                    pushname: message.contact?.pushname || '',
                    number: contactId.replace('@s.whatsapp.net', ''),
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
        const { message, scheduledTime, targetGroup } = req.body;

        if (!message || !scheduledTime || !targetGroup) {
            return res.json({
                success: false,
                error: 'Dados obrigatórios: message, scheduledTime, targetGroup'
            });
        }

        const { data, error } = await supabase
            .from('auto_messages')
            .insert([{
                message: message,
                scheduled_time: scheduledTime,
                target_group: targetGroup,
                is_active: true,
                user_id: 'default'
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
            msg.message && msg.scheduledTime && msg.targetGroup
        ).map(msg => ({
            message: msg.message,
            scheduled_time: msg.scheduledTime,
            target_group: msg.targetGroup,
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
            .eq('scheduled_time', currentTime);

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

                await sock.sendMessage(targetJid, {
                    text: autoMessage.message
                });

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