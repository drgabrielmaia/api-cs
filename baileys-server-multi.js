const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Multi-user WhatsApp sessions storage
const userSessions = new Map(); // userId -> session data
const userSSEClients = new Map(); // userId -> Set of SSE clients

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

    session.sock.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];

        if (!message.message) return;
        if (message.key.remoteJid === 'status@broadcast') return;

        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const messageText = message.message.conversation ||
                           message.message.extendedTextMessage?.text || '';

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

        if (!message.key.fromMe) {
            const groupInfo = isGroup ? ` no grupo "${chatName}"` : '';
            console.log(`📨 [${userId}] MENSAGEM RECEBIDA${groupInfo}: ${messageText}`);

            if (messageText.toLowerCase().includes('ping')) {
                try {
                    await session.sock.sendMessage(message.key.remoteJid, { text: 'pong' });
                    console.log(`✅ [${userId}] Pong enviado!`);
                } catch (error) {
                    console.error(`❌ [${userId}] Erro ao enviar pong:`, error);
                }
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
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
            from: jid,
            to: jid,
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

    const chatMsgs = session.chatMessages.get(chatId) || [];
    const limitedChatMessages = chatMsgs.slice(0, limit);

    res.json({
        success: true,
        data: limitedChatMessages
    });
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
        message: 'WhatsApp Multi-User Baileys API is running',
        activeUsers: userSessions.size
    });
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
                <h1>🚀 WhatsApp Multi-User API</h1>
                <p><strong>Suporte a múltiplos usuários com Baileys!</strong></p>
                <div style="background: #f5f5f5; padding: 20px; margin: 20px auto; max-width: 600px; border-radius: 10px;">
                    <h3>📊 Status do Sistema</h3>
                    <p>👥 Usuários registrados: <strong>${userCount}</strong></p>
                    <p>✅ Usuários conectados: <strong>${readyCount}</strong></p>
                </div>
                <div style="text-align: left; max-width: 800px; margin: 0 auto;">
                    <h3>🔧 API Endpoints</h3>
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
                </div>
            </body>
        </html>
    `);
});

app.listen(port, async () => {
    console.log(`🚀 WhatsApp Multi-User Baileys API rodando em http://localhost:${port}`);
    console.log(`👥 Sistema preparado para múltiplos usuários`);
    console.log(`📱 Acesse http://localhost:${port} para ver o status`);
    console.log(`🔧 Endpoints: /users/{userId}/register para registrar novos usuários`);
});