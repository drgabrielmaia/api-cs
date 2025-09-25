const { Client } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let client;
let qrCodeData = null;
let isReady = false;
let isConnecting = false;

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

app.listen(port, () => {
    console.log(`🚀 WhatsApp API rodando em http://localhost:${port}`);
    console.log(`📱 Acesse http://localhost:${port} para ver o QR Code`);

    initializeClient();
});