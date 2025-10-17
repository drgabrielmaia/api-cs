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

        // Verificar se é uma resposta a botão (formato antigo e novo)
        const isButtonResponse = message.message.buttonsResponseMessage || message.message.templateButtonReplyMessage;

        if (isButtonResponse) {
            const buttonId = message.message.buttonsResponseMessage?.selectedButtonId ||
                            message.message.templateButtonReplyMessage?.selectedId;

            console.log(`🔘 [${userId}] Botão clicado: ${buttonId}`);

            // Gerar protocolo único para esta resposta
            const protocol = generateProtocol();
            const participantName = message.pushName || chatId.replace('@s.whatsapp.net', '');

            // Verificar diferentes tipos de botões
            if (buttonId && buttonId.startsWith('confirm_call_')) {
                const eventId = buttonId.replace('confirm_call_', '');
                console.log(`✅ [${userId}] Confirmação de call recebida para evento: ${eventId}`);

                // Responder com protocolo
                await session.sock.sendMessage(chatId, {
                    text: `✅ Confirmação recebida!\n\n📋 Protocolo: ${protocol}\n\nObrigado por confirmar sua presença.`
                });

                // Encaminhar para admin
                const adminPhone = '5583996910414@s.whatsapp.net';
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
                const adminPhone = '5583996910414@s.whatsapp.net';
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
            const participantName = message.pushName || chatId.replace('@s.whatsapp.net', '');

            // Verificar se esta pessoa está na lista de confirmações pendentes
            if (pendingConfirmations.has(chatId)) {
                const confirmationData = pendingConfirmations.get(chatId);

                // Verificar se ainda não excedeu o limite de 2 mensagens
                if (confirmationData.count < confirmationData.maxMessages) {
                    confirmationData.count++;

                    const adminPhone = '5583996910414@s.whatsapp.net';
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

                const sentAdmin = await sendWhatsAppMessage(adminPhone, adminMessage);
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

    // Job para resumo diário às 7h da manhã (horário de São Paulo)
    cron.schedule('0 4 * * *', () => {
        console.log('🌅 Enviando resumo diário dos compromissos...');
        addNotificationLog('info', 'Executando resumo diário dos compromissos (7h SP)');
        checkAndSendNotifications(true);
    });

    console.log('⏰ Cron jobs configurados:');
    console.log('   - Verificação de lembretes a cada 2 minutos (30min antes)');
    console.log('   - Resumo diário às 4h UTC (7h São Paulo)');
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

        // Gerar conteúdo do relatório
        const reportType = weeklyOnly ? 'Semanal' : 'Geral';
        const reportDate = new Date().toLocaleDateString('pt-BR');

        let pdfContent = `📊 RELATÓRIO DE LEADS - ${reportType.toUpperCase()}\n`;
        pdfContent += `📅 Data: ${reportDate}\n`;
        pdfContent += `📋 Total de leads: ${leads.length}\n\n`;

        if (weeklyOnly) {
            pdfContent += `📊 LEADS DA ÚLTIMA SEMANA\n`;
            pdfContent += `(${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('pt-BR')} - ${reportDate})\n\n`;
        }

        pdfContent += '═'.repeat(50) + '\n\n';

        if (leads.length === 0) {
            pdfContent += '📭 Nenhum lead encontrado no período.\n\n';
        } else {
            leads.forEach((lead, index) => {
                pdfContent += `${index + 1}. *${lead.nome_completo}*\n`;
                pdfContent += `   📍 Origem: ${lead.origem || 'Não informado'}\n`;
                pdfContent += `   🎯 Status: ${lead.status}\n`;
                if (lead.observacoes) {
                    pdfContent += `   📝 Observações: ${lead.observacoes.substring(0, 100)}${lead.observacoes.length > 100 ? '...' : ''}\n`;
                }
                pdfContent += `   📅 Cadastrado: ${new Date(lead.created_at).toLocaleDateString('pt-BR')}\n\n`;
            });
        }

        return {
            content: pdfContent,
            filename: `leads_${weeklyOnly ? 'semanal' : 'geral'}_${new Date().toISOString().split('T')[0]}.txt`,
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

        // Enviar mensagem com relatório
        await session.sock.sendMessage(jid, { text: pdfData.content });

        console.log(`✅ Relatório de leads ${pdfData.reportType} enviado para ${phoneNumber}`);

        addNotificationLog('success', `Relatório de leads ${pdfData.reportType} enviado via WhatsApp`, {
            destinatario: phoneNumber,
            leadsCount: pdfData.leadsCount,
            tipo: pdfData.reportType
        });

        return true;

    } catch (error) {
        console.error('Erro ao enviar relatório por WhatsApp:', error);
        addNotificationLog('error', 'Erro ao enviar relatório de leads via WhatsApp', { error: error.message });
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

app.listen(port, async () => {
    console.log(`🚀 WhatsApp Multi-User Baileys API rodando em https://api.medicosderesultado.com.br`);
    console.log(`👥 Sistema preparado para múltiplos usuários`);
    console.log(`📱 Acesse https://api.medicosderesultado.com.br para ver o status`);
    console.log(`🔧 Endpoints: /users/{userId}/register para registrar novos usuários`);

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