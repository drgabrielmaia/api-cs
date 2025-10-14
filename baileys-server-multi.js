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

// Multi-user WhatsApp sessions storage
const userSessions = new Map(); // userId -> session data
const userSSEClients = new Map(); // userId -> Set of SSE clients

// Configuração do Supabase
const supabaseUrl = 'https://udzmlnnztzzwrphhizol.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';
const supabase = createClient(supabaseUrl, supabaseKey);

const adminPhone = '558396910414'; // Gabriel Maia
const defaultUserId = 'default'; // Usuário padrão para notificações

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
            // Ignorar status broadcasts
            if (msg.key.remoteJid === 'status@broadcast') return false;
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
                number: isGroup ? chatId : chatId.replace('@s.whatsapp.net', '')
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
                    name: message.pushName || chatId.replace('@s.whatsapp.net', ''),
                    pushname: message.pushName || '',
                    number: chatId.replace('@s.whatsapp.net', ''),
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

        // Manter ping/pong para testes
        if (messageText.toLowerCase().includes('ping')) {
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
                                number: msg.key.remoteJid?.replace('@s.whatsapp.net', '') || ''
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
    const { to, message } = req.body;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({
            success: false,
            error: 'WhatsApp não está conectado para este usuário'
        });
    }

    try {
        let jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const sentMessage = await session.sock.sendMessage(jid, { text: message });

        // Create message object for sent message
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,  // Quem enviou (eu)
            to: jid,                     // Para quem foi enviado
            body: message,
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

                const sent = await sendBaileysMessage(adminPhone, message);
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

        await defaultSession.sock.sendMessage(formattedNumber, { text: message });
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
            saoPauloTime.setHours(saoPauloTime.getHours() - 3); // Converter para SP

            const todayStart = new Date(saoPauloTime.getFullYear(), saoPauloTime.getMonth(), saoPauloTime.getDate());
            const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

            // Converter de volta para UTC para buscar no banco
            const todayStartUTC = new Date(todayStart.getTime() + 3 * 60 * 60 * 1000);
            const todayEndUTC = new Date(todayEnd.getTime() + 3 * 60 * 60 * 1000);

            const eventsToday = events.filter(event => {
                const eventTime = new Date(event.start_datetime);
                return eventTime >= todayStartUTC && eventTime < todayEndUTC;
            });

            if (eventsToday.length > 0) {
                let summaryMessage = `🌅 Bom dia! Aqui estão seus compromissos de hoje:\n\n`;

                for (const event of eventsToday) {
                    const eventTime = new Date(event.start_datetime);
                    // Diminuir 3h para converter para horário de São Paulo
                    const eventTimeSP = new Date(eventTime.getTime() - 3 * 60 * 60 * 1000);
                    const timeStr = eventTimeSP.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

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

                // Marcar como enviado ANTES de enviar mensagem
                const marked = await markEventMessageSent(event.id);
                if (!marked) {
                    console.log(`❌ Falha ao marcar evento ${event.id} como enviado. Pulando para evitar spam.`);
                    continue;
                }

                // Para mentorado
                if (event.mentorado_id && event.mentorados && event.mentorados.telefone) {
                    const normalizedPhone = normalizePhone(event.mentorados.telefone);
                    console.log(`📞 Mentorado phone: ${event.mentorados.telefone} → normalized: ${normalizedPhone}`);

                    const message = `Oi ${event.mentorados.nome_completo}! Falta meia hora para nossa call 🙌\n\n` +
                                  `Prepare um lugar tranquilo para que a gente possa mergulhar de verdade no seu cenário e já construir juntos os primeiros passos rumo à sua liberdade e transformação. 🚀`;

                    const sent = await sendWhatsAppMessage(normalizedPhone, message);
                    if (sent) {
                        notificationsSent++;
                        console.log(`✅ Lembrete enviado para mentorado: ${event.mentorados.nome_completo}`);
                    }
                }

                // Para lead (mesmo tipo de mensagem)
                console.log(`🔍 Debug lead - event.lead_id: ${event.lead_id}, event.leads: ${JSON.stringify(event.leads)}`);

                if (event.lead_id && event.leads && event.leads.telefone) {
                    const normalizedPhone = normalizePhone(event.leads.telefone);
                    console.log(`📞 Lead phone: ${event.leads.telefone} → normalized: ${normalizedPhone}`);
                    console.log(`📱 Enviando mensagem para lead: ${event.leads.nome_completo} (${normalizedPhone})`);

                    const message = `Oi ${event.leads.nome_completo}! Falta meia hora para nossa call 🙌\n\n` +
                                  `Prepare um lugar tranquilo para que a gente possa mergulhar de verdade no seu cenário e já construir juntos os primeiros passos rumo à sua liberdade e transformação. 🚀`;

                    const sent = await sendWhatsAppMessage(normalizedPhone, message);
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

// Configurar cron jobs
function setupCronJobs() {
    // Job principal: verificar a cada 2 minutos para lembretes de 30min
    cron.schedule('*/2 * * * *', () => {
        checkAndSendNotifications(false);
    });

    // Job para resumo diário às 7h da manhã (horário de São Paulo)
    cron.schedule('0 4 * * *', () => {
        console.log('🌅 Enviando resumo diário dos compromissos...');
        checkAndSendNotifications(true);
    });

    console.log('⏰ Cron jobs configurados:');
    console.log('   - Verificação de lembretes a cada 2 minutos (30min antes)');
    console.log('   - Resumo diário às 4h UTC (7h São Paulo)');
}

// Endpoint para testar notificações manualmente
app.post('/test-notifications', async (req, res) => {
    const { isDailySummary } = req.body;
    console.log('🧪 Testando sistema de notificações...');
    await checkAndSendNotifications(isDailySummary || false);
    res.json({ success: true, message: `Teste de ${isDailySummary ? 'resumo diário' : 'notificações'} executado` });
});

// Endpoint para forçar envio de mensagem de teste
app.post('/test-whatsapp', async (req, res) => {
    try {
        const { phone, message } = req.body;
        const phoneToUse = phone || adminPhone;
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
        const sentAdmin = await sendWhatsAppMessage(adminPhone, adminMessage);
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

app.listen(port, async () => {
    console.log(`🚀 WhatsApp Multi-User Baileys API rodando em http://localhost:${port}`);
    console.log(`👥 Sistema preparado para múltiplos usuários`);
    console.log(`📱 Acesse http://localhost:${port} para ver o status`);
    console.log(`🔧 Endpoints: /users/{userId}/register para registrar novos usuários`);

    // Configurar jobs após 10 segundos (dar tempo para sessões conectarem)
    setTimeout(() => {
        setupCronJobs();
    }, 10000);
});