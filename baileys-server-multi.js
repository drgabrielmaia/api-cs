const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const crypto = require('crypto');
const multer = require('multer');
// PostgreSQL direct connection (replaces @supabase/supabase-js)
// db.js provides supabase-compatible .from().select().eq() API
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

// Mapeamento de números reais para @lid (para respostas automáticas)
const phoneToLidMapping = {
    '5583996910414': '98260429606914@lid',
    '83996910414': '98260429606914@lid',
    '996910414': '98260429606914@lid'
};

// Mapeamento de @lid para números reais (para envio manual)
const lidToPhoneMapping = {
    '98260429606914@lid': '5583996910414'
};

// Função para converter número real para @lid (para respostas automáticas)
function convertPhoneToLid(phoneNumber) {
    const cleanNum = phoneNumber.replace(/\D/g, '');
    
    // Testar todas as variações
    for (const [key, lid] of Object.entries(phoneToLidMapping)) {
        if (cleanNum.includes(key) || cleanNum.endsWith(key.slice(-9))) {
            console.log(`🔄 Convertendo número para @lid: ${phoneNumber} → ${lid}`);
            return lid;
        }
    }
    
    return phoneNumber; // Retorna original se não encontrar
}

// Função para limpar número de telefone de sufixos WhatsApp e extrair número real
async function cleanPhoneNumber(phoneId, contact = null, session = null) {
    if (!phoneId) return '';
    
    // 🎯 MAPEAMENTO: Se é um @lid conhecido, usar número real
    if (phoneId.includes('@lid') && lidToPhoneMapping[phoneId]) {
        console.log(`📱 Usando mapeamento @lid → número real: ${phoneId} → ${lidToPhoneMapping[phoneId]}`);
        return lidToPhoneMapping[phoneId];
    }
    
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
    origin: true, // Allow all origins (nginx handles prod restrictions)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Middleware para capturar body raw (necessário para validação HMAC do Instagram)
app.use('/instagram-webhook', express.raw({ 
    type: 'application/json',
    verify: (req, res, buffer) => {
        req.rawBody = buffer;
    }
}));

app.use(express.json());

// File upload configuration (multer)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const fileUpload = multer({
    storage: uploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (suporte a vídeos)
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/quicktime', 'video/webm', 'video/avi',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        cb(null, allowed.includes(file.mimetype));
    }
});
app.use('/uploads', express.static(uploadDir));

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

// Conexão direta com PostgreSQL (substituiu Supabase)
const supabase = require('./db');
const { generateToken, authMiddleware } = require('./auth-middleware');

// ===== AUTH ROUTES =====

// POST /auth/login
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

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

        const queries = [
            supabase.query(
                `SELECT id, origem, created_at, status, valor_vendido, valor_arrecadado,
                        data_venda, convertido_em, status_updated_at
                 FROM leads WHERE organization_id = $1`,
                [organization_id]
            ),
            supabase.query(
                start && end
                    ? `SELECT COUNT(*) as count FROM mentorados WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3`
                    : `SELECT COUNT(*) as count FROM mentorados WHERE organization_id = $1`,
                start && end ? [organization_id, start, end] : [organization_id]
            ),
            supabase.query(
                start && end
                    ? `SELECT COUNT(*) as count FROM calendar_events WHERE organization_id = $1 AND start_time >= $2 AND start_time <= $3`
                    : `SELECT COUNT(*) as count FROM calendar_events WHERE organization_id = $1 AND start_time >= NOW()`,
                start && end ? [organization_id, start, end] : [organization_id]
            ),
            supabase.query(
                `SELECT COUNT(DISTINCT mentorado_id) as count FROM dividas
                 WHERE organization_id = $1 AND status = 'pendente'`,
                [organization_id]
            ),
            supabase.query(
                `SELECT COUNT(*) as count FROM comissoes
                 WHERE organization_id = $1 AND status = 'pendente'`,
                [organization_id]
            ),
            supabase.query(
                `SELECT nome_completo, email, status, created_at, updated_at
                 FROM leads WHERE organization_id = $1
                 ORDER BY updated_at DESC LIMIT 5`,
                [organization_id]
            ),
            supabase.query(
                `SELECT nome_completo, email, created_at, updated_at
                 FROM mentorados WHERE organization_id = $1
                 ORDER BY updated_at DESC LIMIT 3`,
                [organization_id]
            ),
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

// =====================================================================
// POST /api/query - Generic CRUD proxy (Supabase-compatible)
// =====================================================================
app.post('/api/query', (req, res, next) => {
    // Optional auth: try to validate JWT, but allow SELECT without it
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const { verifyToken } = require('./auth-middleware');
            req.user = verifyToken(token);
        } catch (err) {
            // Invalid token - still allow SELECT
        }
    }
    const op = req.body?.operation || 'select';
    if (!req.user && op !== 'select') {
        return res.status(401).json({ data: null, error: { message: 'Token necessário para operações de escrita' } });
    }
    next();
}, async (req, res) => {
    try {
        const { table, operation, select, filters, order, limit, offset, range,
                single, maybeSingle, count, data, onConflict, returning } = req.body;

        if (!table) return res.status(400).json({ data: null, error: 'Missing table' });

        let qb = supabase.from(table);

        // Apply operation
        switch (operation || 'select') {
            case 'select':
                qb = qb.select(select || '*', count ? { count } : undefined);
                break;
            case 'insert':
                qb = qb.insert(Array.isArray(data) ? data : [data]);
                if (returning !== false) qb = qb.select(select || '*');
                break;
            case 'update':
                qb = qb.update(data);
                if (returning !== false) qb = qb.select(select || '*');
                break;
            case 'delete':
                qb = qb.delete();
                if (returning !== false) qb = qb.select(select || '*');
                break;
            case 'upsert':
                qb = qb.upsert(Array.isArray(data) ? data : [data], onConflict ? { onConflict } : undefined);
                if (returning !== false) qb = qb.select(select || '*');
                break;
        }

        // Apply filters
        for (const f of (filters || [])) {
            switch (f.type) {
                case 'eq': qb = qb.eq(f.column, f.value); break;
                case 'neq': qb = qb.neq(f.column, f.value); break;
                case 'gt': qb = qb.gt(f.column, f.value); break;
                case 'gte': qb = qb.gte(f.column, f.value); break;
                case 'lt': qb = qb.lt(f.column, f.value); break;
                case 'lte': qb = qb.lte(f.column, f.value); break;
                case 'in': qb = qb.in(f.column, f.value); break;
                case 'is': qb = qb.is(f.column, f.value); break;
                case 'not': qb = qb.not(f.column, f.op, f.value); break;
                case 'or': qb = qb.or(f.value); break;
                case 'ilike': qb = qb.ilike(f.column, f.value); break;
                case 'like': qb = qb.like(f.column, f.value); break;
            }
        }

        // Apply order
        for (const o of (order || [])) {
            qb = qb.order(o.column, { ascending: o.ascending !== false });
        }

        // Apply range (offset + limit)
        if (range) {
            qb = qb.range(range.from, range.to);
        } else {
            if (limit != null) qb = qb.limit(limit);
        }

        // Apply modifiers
        if (single) qb = qb.single();
        if (maybeSingle) qb = qb.maybeSingle();

        const result = await qb;

        // Auto-notification hook: send WhatsApp group message on insert
        if ((operation === 'insert') && result.data && !result.error) {
            if (table === 'video_lessons' || table === 'group_events') {
                // Fire-and-forget to not block response
                setImmediate(() => {
                    handlePostInsertNotification(table, result.data).catch(err => {
                        console.error('❌ Post-insert notification error:', err.message);
                    });
                });
            }
        }

        const errorOut = result.error
            ? { message: result.error.message || String(result.error), code: result.error.code || undefined }
            : null;
        res.json({ data: result.data, error: errorOut, count: result.count != null ? result.count : null });
    } catch (err) {
        console.error('❌ /api/query error:', err.message);
        res.status(500).json({ data: null, error: { message: err.message }, count: null });
    }
});

// =====================================================================
// POST /api/rpc/:name - RPC proxy for stored procedures
// =====================================================================
app.post('/api/rpc/:name', authMiddleware, async (req, res) => {
    try {
        const name = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
        const params = req.body || {};

        // Build parameterized function call
        const paramKeys = Object.keys(params);
        const values = paramKeys.map(k => params[k]);

        let sql;
        if (paramKeys.length === 0) {
            sql = `SELECT * FROM ${name}()`;
        } else {
            const paramList = paramKeys.map((k, i) => `"${k}" => $${i + 1}`).join(', ');
            sql = `SELECT * FROM ${name}(${paramList})`;
        }

        const result = await supabase.query(sql, values);
        res.json({ data: result.rows, error: null });
    } catch (err) {
        console.error(`❌ /api/rpc/${req.params.name} error:`, err.message);
        res.status(400).json({ data: null, error: { message: err.message } });
    }
});

// =====================================================================
// POST /api/upload - File upload endpoint
// =====================================================================
app.post('/api/upload', fileUpload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado ou formato não permitido' });
    }
    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${baseUrl}/uploads/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename, size: req.file.size });
});

// =====================================================================
// WhatsApp Group endpoints (Baileys multi-session)
// =====================================================================
app.get('/api/whatsapp/groups', async (req, res) => {
    const userId = req.query.userId || 'default';
    const session = userSessions.get(userId);
    if (!session || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }
    try {
        const groups = await session.sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0,
        }));
        res.json({ success: true, groups: groupList });
    } catch (error) {
        console.error('Erro ao listar grupos:', error);
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/whatsapp/send-group', async (req, res) => {
    const { groupId, message, userId } = req.body;
    const sessionId = userId || 'default';
    const session = userSessions.get(sessionId);

    if (!session || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }
    if (!groupId || !message) {
        return res.json({ success: false, error: 'groupId e message são obrigatórios' });
    }

    try {
        await session.sock.sendMessage(groupId, { text: message });
        console.log(`✅ Mensagem enviada para grupo: ${groupId}`);
        res.json({ success: true, message: 'Mensagem enviada ao grupo' });
    } catch (error) {
        console.error('Erro ao enviar para grupo:', error);
        res.json({ success: false, error: error.message });
    }
});

// Configure which WhatsApp group receives auto-notifications for an organization
app.post('/api/whatsapp/configure-group', async (req, res) => {
    const { organizationId, groupId } = req.body;
    const orgId = organizationId || '9c8c0033-15ea-4e33-a55f-28d81a19693b';

    if (!groupId) {
        return res.json({ success: false, error: 'groupId é obrigatório' });
    }

    try {
        await supabase.query(
            `UPDATE organizations SET whatsapp_group_jid = $1 WHERE id = $2`,
            [groupId, orgId]
        );
        console.log(`✅ Grupo WhatsApp configurado para org ${orgId}: ${groupId}`);
        res.json({ success: true, message: 'Grupo configurado com sucesso', groupId });
    } catch (error) {
        console.error('Erro ao configurar grupo:', error);
        res.json({ success: false, error: error.message });
    }
});

// Get current configured group for an organization
app.get('/api/whatsapp/configured-group', async (req, res) => {
    const orgId = req.query.organizationId || '9c8c0033-15ea-4e33-a55f-28d81a19693b';
    try {
        const result = await supabase.query(
            `SELECT whatsapp_group_jid FROM organizations WHERE id = $1 LIMIT 1`,
            [orgId]
        );
        const jid = result.rows?.[0]?.whatsapp_group_jid || null;
        res.json({ success: true, groupId: jid });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Função para obter número do admin baseado na organização
const getAdminPhone = async (organizationId = 'default') => {
  return await settingsManager.getAdminPhone(organizationId);
};
const defaultUserId = 'default'; // Usuário padrão para notificações

// =====================================================================
// Auto-notification: send WhatsApp group message on insert
// =====================================================================
const DEFAULT_ORG_ID = '9c8c0033-15ea-4e33-a55f-28d81a19693b';

async function getOrgWhatsAppGroupJid(orgId, type = 'aulas') {
    try {
        const col = type === 'eventos' ? 'whatsapp_group_eventos' : 'whatsapp_group_aulas';
        const notifyCol = type === 'eventos' ? 'whatsapp_auto_notify_evento' : 'whatsapp_auto_notify_aula';
        const result = await supabase.query(
            `SELECT ${col}, ${notifyCol}, whatsapp_group_jid FROM organizations WHERE id = $1 LIMIT 1`,
            [orgId]
        );
        const row = result.rows?.[0];
        if (!row) return null;
        // Checar se notificação está ativa
        if (!row[notifyCol]) return null;
        // Usar campo específico, fallback para whatsapp_group_jid
        return row[col] || row.whatsapp_group_jid || null;
    } catch (err) {
        console.error('❌ Erro ao buscar group JID:', err.message);
        return null;
    }
}

async function sendGroupNotification(orgId, message, type = 'aulas') {
    try {
        const groupJid = await getOrgWhatsAppGroupJid(orgId, type);
        if (!groupJid) {
            console.log(`⚠️ Org ${orgId} não tem grupo WhatsApp configurado`);
            return false;
        }

        // Try org-specific session first, then default
        let session = userSessions.get(orgId);
        if (!session?.sock || !session.isReady) {
            session = userSessions.get(defaultUserId);
        }
        if (!session?.sock || !session.isReady) {
            console.log('⚠️ Nenhuma sessão WhatsApp conectada para enviar notificação');
            return false;
        }

        await session.sock.sendMessage(groupJid, { text: message });
        console.log(`✅ Notificação enviada para grupo: ${groupJid}`);
        return true;
    } catch (err) {
        console.error('❌ Erro ao enviar notificação para grupo:', err.message);
        return false;
    }
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    } catch { return dateStr; }
}

async function handlePostInsertNotification(table, insertedData) {
    const rows = Array.isArray(insertedData) ? insertedData : [insertedData];

    for (const row of rows) {
        const orgId = row.organization_id || DEFAULT_ORG_ID;
        let message = null;

        if (table === 'video_lessons') {
            // Buscar nome do módulo
            let moduleName = '';
            if (row.module_id) {
                try {
                    const modResult = await supabase.query(
                        `SELECT title FROM video_modules WHERE id = $1 LIMIT 1`,
                        [row.module_id]
                    );
                    moduleName = modResult.rows?.[0]?.title || '';
                } catch {}
            }
            message = `📚 *Nova aula disponível!*\n\n` +
                `📖 *${row.title || 'Nova aula'}*\n` +
                (moduleName ? `📁 Módulo: ${moduleName}\n` : '') +
                (row.description ? `\n${row.description}\n` : '') +
                `\n🔗 Acesse o portal para assistir: cs.medicosderesultado.com.br/mentorado/videos`;

        } else if (table === 'group_events') {
            const isPaid = row.is_paid && row.valor_ingresso > 0;
            message = `🎯 *Novo evento agendado!*\n\n` +
                `📌 *${row.name || 'Novo evento'}*\n` +
                (row.date_time ? `📅 Data: ${formatDate(row.date_time)}\n` : '') +
                (row.local_evento ? `📍 Local: ${row.local_evento}\n` : '') +
                (row.meeting_link ? `🔗 Link: ${row.meeting_link}\n` : '') +
                (isPaid ? `💰 Ingresso: R$ ${parseFloat(row.valor_ingresso).toFixed(2)}\n` : '') +
                (row.max_participants ? `👥 Vagas: ${row.max_participants}\n` : '') +
                (row.description ? `\n${row.description}\n` : '') +
                `\n🔗 Confira no portal: cs.medicosderesultado.com.br/mentorado/eventos`;
        }

        if (message) {
            const notifyType = table === 'group_events' ? 'eventos' : 'aulas';
            await sendGroupNotification(orgId, message, notifyType);
        }
    }
}

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

        // ========================
        // DETECÇÃO DE RESPOSTA DE LEAD (FOLLOW-UP)
        // ========================
        if (!message.key.fromMe && !isGroup) {
            try {
                const senderPhone = chatId.replace('@s.whatsapp.net', '').replace('@lid', '');
                const last9 = senderPhone.slice(-9);

                if (last9.length === 9) {
                    const { data: matchedLeads } = await supabase
                        .from('leads')
                        .select('id')
                        .or(`telefone.ilike.%${last9}`)
                        .limit(10);

                    if (matchedLeads && matchedLeads.length > 0) {
                        const leadIds = matchedLeads.map(l => l.id);
                        const { data: activeExecs } = await supabase
                            .from('lead_followup_executions')
                            .select('id')
                            .eq('status', 'active')
                            .in('lead_id', leadIds);

                        if (activeExecs && activeExecs.length > 0) {
                            const execIds = activeExecs.map(e => e.id);
                            for (const execId of execIds) {
                                await supabase.from('lead_followup_executions').update({
                                    status: 'responded',
                                    data_resposta: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                }).eq('id', execId);
                            }
                            console.log(`💬 [FOLLOW-UP] Lead respondeu! ${execIds.length} execução(ões) marcada(s) como 'responded' (tel: ...${last9})`);
                        }
                    }
                }
            } catch (followupErr) {
                console.error(`⚠️ [FOLLOW-UP] Erro na detecção de resposta:`, followupErr);
            }
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

        const cleanNumber = isGroup ? chatId : (chatId.includes('@') ? chatId.replace(/@.*$/, '') : chatId);
        const messageObj = {
            id: message.key.id,
            from: message.key.fromMe ? session.sock.user.id : chatId,
            to: message.key.fromMe ? chatId : session.sock.user.id,
            body: messageText,
            type: 'text',
            timestamp: Date.now(),
            isFromMe: message.key.fromMe,
            contact: {
                id: chatId,
                name: chatName,
                pushname: message.pushName || '',
                number: cleanNumber
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
                const contactNumber = chatId.replace(/@.*$/, '');
                const newContact = {
                    id: chatId,
                    name: message.pushName || contactNumber,
                    pushname: message.pushName || '',
                    number: contactNumber,
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

// ================ INSTAGRAM WEBHOOK MIDDLEWARE ================

/**
 * Middleware de validação HMAC-SHA256 para webhooks do Instagram
 * Valida a assinatura enviada pela Meta no cabeçalho X-Hub-Signature-256
 */
function validateInstagramSignature(req, res, next) {
    try {
        // Extrai a assinatura do cabeçalho
        const signature = req.get('X-Hub-Signature-256');
        
        if (!signature) {
            console.error('❌ Instagram webhook - Assinatura não encontrada');
            return res.status(403).json({ error: 'Assinatura não encontrada' });
        }

        // Remove o prefixo "sha256="
        const expectedHash = signature.split('sha256=')[1];
        
        if (!expectedHash) {
            console.error('❌ Instagram webhook - Formato de assinatura inválido');
            return res.status(403).json({ error: 'Formato de assinatura inválido' });
        }

        // Verifica se APP_SECRET está configurado
        if (!process.env.APP_SECRET) {
            console.error('❌ Instagram webhook - APP_SECRET não configurado');
            return res.status(500).json({ error: 'Servidor não configurado corretamente' });
        }

        // Calcula o hash HMAC-SHA256
        const calculatedHash = crypto
            .createHmac('sha256', process.env.APP_SECRET)
            .update(req.rawBody)
            .digest('hex');

        // Comparação segura para prevenir timing attacks
        const expectedBuffer = Buffer.from(expectedHash, 'hex');
        const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

        if (expectedBuffer.length !== calculatedBuffer.length || 
            !crypto.timingSafeEqual(expectedBuffer, calculatedBuffer)) {
            console.error('❌ Instagram webhook - Assinatura inválida');
            return res.status(403).json({ error: 'Assinatura inválida' });
        }

        console.log('✅ Instagram webhook - Assinatura validada com sucesso');
        
        // Converte buffer para JSON após validação
        try {
            req.body = JSON.parse(req.rawBody.toString());
        } catch (parseError) {
            console.error('❌ Instagram webhook - Erro ao fazer parse do JSON:', parseError);
            return res.status(400).json({ error: 'JSON inválido' });
        }

        next();

    } catch (error) {
        console.error('❌ Instagram webhook - Erro na validação:', error);
        return res.status(500).json({ error: 'Erro interno na validação' });
    }
}

/**
 * Processa mensagem do Instagram Direct Message
 * 🔥 AQUI VOCÊ CONECTA COM O BANCO DE DADOS 🔥
 */
async function processInstagramMessage(messaging) {
    try {
        console.log('📨 Instagram DM recebido:', JSON.stringify(messaging, null, 2));

        const senderId = messaging.sender?.id;
        const recipientId = messaging.recipient?.id;
        const timestamp = messaging.timestamp;
        
        if (messaging.message) {
            const message = messaging.message;
            const messageId = message.mid;
            const messageText = message.text;
            const attachments = message.attachments;

            console.log('💬 Nova mensagem Instagram:', {
                senderId,
                recipientId,
                messageId,
                messageText,
                attachments: attachments?.length || 0,
                timestamp: new Date(timestamp)
            });

            // 🔥 CONECTAR COM SUPABASE AQUI 🔥
            // Exemplo de como salvar no banco:
            /*
            if (supabase) {
                const { data, error } = await supabase
                    .from('instagram_messages')
                    .insert({
                        sender_id: senderId,
                        recipient_id: recipientId,
                        message_id: messageId,
                        message_text: messageText,
                        attachments: attachments || [],
                        timestamp: new Date(timestamp),
                        platform: 'instagram',
                        processed_at: new Date()
                    });
                
                if (error) {
                    console.error('❌ Erro ao salvar mensagem Instagram:', error);
                } else {
                    console.log('✅ Mensagem Instagram salva no banco:', data);
                }
            }
            */

            // Log para implementação
            addNotificationLog('info', 'Mensagem Instagram recebida', {
                senderId,
                messageText: messageText?.substring(0, 100) + (messageText?.length > 100 ? '...' : ''),
                timestamp
            });
        }

        // Processa outros eventos (read, delivery, etc.)
        if (messaging.read) {
            console.log('👀 Instagram - Mensagem lida:', messaging.read);
        }

        if (messaging.delivery) {
            console.log('📬 Instagram - Mensagem entregue:', messaging.delivery);
        }

    } catch (error) {
        console.error('❌ Erro ao processar mensagem Instagram:', error);
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
        // Resolver número: @lid → número real → testar variações BR no WhatsApp
        let jid;
        if (targetNumber.includes('@lid')) {
            const cleanedNumber = await cleanPhoneNumber(targetNumber, null, session);
            jid = cleanedNumber.includes('@') ? cleanedNumber : `${cleanedNumber}@s.whatsapp.net`;
        } else if (targetNumber.includes('@g.us')) {
            jid = targetNumber; // Grupo - não alterar
        } else {
            jid = await resolveWhatsAppJid(targetNumber, session);
        }

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
        const cleanJidNumber = jid.replace(/@.*$/, '');
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,
            to: jid,
            body: messageText,
            type: 'text',
            timestamp: Date.now(),
            isFromMe: true,
            contact: {
                id: jid,
                name: cleanJidNumber,
                pushname: '',
                number: cleanJidNumber
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

// User-specific send image
app.post('/users/:userId/send-image', async (req, res) => {
    const { userId } = req.params;
    const { to, phoneNumber, imageUrl, imageBase64, caption } = req.body;
    const targetNumber = to || phoneNumber;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }

    try {
        // Resolver número: @lid → número real → testar variações BR no WhatsApp
        let jid;
        if (targetNumber.includes('@lid')) {
            const cleanedNumber = await cleanPhoneNumber(targetNumber, null, session);
            jid = cleanedNumber.includes('@') ? cleanedNumber : `${cleanedNumber}@s.whatsapp.net`;
        } else if (targetNumber.includes('@g.us')) {
            jid = targetNumber;
        } else {
            jid = await resolveWhatsAppJid(targetNumber, session);
        }

        let imageBuffer;
        let mimetype = 'image/jpeg';

        if (imageBase64) {
            // Base64 image
            const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                mimetype = matches[1];
                imageBuffer = Buffer.from(matches[2], 'base64');
            } else {
                imageBuffer = Buffer.from(imageBase64, 'base64');
            }
        } else if (imageUrl) {
            // URL image - download it
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error('Falha ao baixar imagem');
            const contentType = imgRes.headers.get('content-type');
            if (contentType) mimetype = contentType;
            const arrayBuffer = await imgRes.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
        } else {
            return res.json({ success: false, error: 'imageUrl ou imageBase64 é obrigatório' });
        }

        const sentMessage = await session.sock.sendMessage(jid, {
            image: imageBuffer,
            mimetype,
            caption: caption || ''
        });

        const cleanJidNumber = jid.replace(/@.*$/, '');
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,
            to: jid,
            body: caption || '[Imagem]',
            type: 'image',
            timestamp: Date.now(),
            isFromMe: true,
            contact: {
                id: jid,
                name: cleanJidNumber,
                pushname: '',
                number: cleanJidNumber
            }
        };

        session.messagesList.unshift(messageObj);
        if (session.messagesList.length > 100) session.messagesList.pop();

        if (!session.chatMessages.has(jid)) session.chatMessages.set(jid, []);
        const chatMsgs = session.chatMessages.get(jid);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop();

        sendEventToUserClients(userId, 'new_message', messageObj);
        sendEventToUserClients(userId, 'chat_message_update', { chatId: jid, message: messageObj });

        res.json({ success: true, message: 'Imagem enviada com sucesso' });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao enviar imagem:`, error);
        res.json({ success: false, error: 'Erro ao enviar imagem' });
    }
});

// Check if phone number exists on WhatsApp
app.post('/users/:userId/check-number', async (req, res) => {
    const { userId } = req.params;
    const { phone } = req.body;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }

    if (!phone) {
        return res.json({ success: false, error: 'phone é obrigatório' });
    }

    try {
        const variations = getBrazilianPhoneVariations(phone);
        console.log(`🔍 [${userId}] Verificando número ${phone}, variações:`, variations);

        if (session.sock.onWhatsApp) {
            for (const variation of variations) {
                try {
                    const result = await session.sock.onWhatsApp(variation);
                    if (result && result.length > 0 && result[0].exists) {
                        console.log(`✅ [${userId}] Número encontrado: ${variation} → ${result[0].jid}`);
                        return res.json({
                            success: true,
                            exists: true,
                            jid: result[0].jid,
                            number: variation
                        });
                    }
                } catch (err) {
                    // Continue testing next variation
                }
            }
        }

        console.log(`❌ [${userId}] Nenhuma variação encontrada no WhatsApp para ${phone}`);
        res.json({ success: true, exists: false, jid: null, number: phone });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao verificar número:`, error);
        res.json({ success: false, error: 'Erro ao verificar número: ' + (error.message || '') });
    }
});

// User-specific send video (base64 or URL)
app.post('/users/:userId/send-video', async (req, res) => {
    const { userId } = req.params;
    const { to, phoneNumber, videoBase64, videoUrl, caption } = req.body;
    const targetNumber = to || phoneNumber;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }

    try {
        let jid;
        if (targetNumber.includes('@lid')) {
            const cleanedNumber = await cleanPhoneNumber(targetNumber, null, session);
            jid = cleanedNumber.includes('@') ? cleanedNumber : `${cleanedNumber}@s.whatsapp.net`;
        } else if (targetNumber.includes('@g.us')) {
            jid = targetNumber;
        } else {
            jid = await resolveWhatsAppJid(targetNumber, session);
        }

        let videoBuffer;
        let mimetype = 'video/mp4';

        if (videoBase64) {
            const matches = videoBase64.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                mimetype = matches[1];
                videoBuffer = Buffer.from(matches[2], 'base64');
            } else {
                videoBuffer = Buffer.from(videoBase64, 'base64');
            }
        } else if (videoUrl) {
            const vidRes = await fetch(videoUrl);
            if (!vidRes.ok) throw new Error('Falha ao baixar vídeo');
            const contentType = vidRes.headers.get('content-type');
            if (contentType) mimetype = contentType;
            const arrayBuffer = await vidRes.arrayBuffer();
            videoBuffer = Buffer.from(arrayBuffer);
        } else {
            return res.json({ success: false, error: 'videoUrl ou videoBase64 é obrigatório' });
        }

        const sentMessage = await session.sock.sendMessage(jid, {
            video: videoBuffer,
            mimetype,
            caption: caption || ''
        });

        const cleanJidNumber = jid.replace(/@.*$/, '');
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,
            to: jid,
            body: caption || '[Vídeo]',
            type: 'video',
            timestamp: Date.now(),
            isFromMe: true,
            contact: {
                id: jid,
                name: cleanJidNumber,
                pushname: '',
                number: cleanJidNumber
            }
        };

        session.messagesList.unshift(messageObj);
        if (session.messagesList.length > 100) session.messagesList.pop();

        if (!session.chatMessages.has(jid)) session.chatMessages.set(jid, []);
        const chatMsgs = session.chatMessages.get(jid);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop();

        sendEventToUserClients(userId, 'new_message', messageObj);
        sendEventToUserClients(userId, 'chat_message_update', { chatId: jid, message: messageObj });

        console.log(`✅ [${userId}] Vídeo enviado para ${jid}`);
        res.json({ success: true, message: 'Vídeo enviado com sucesso' });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao enviar vídeo:`, error);
        res.json({ success: false, error: 'Erro ao enviar vídeo: ' + (error.message || '') });
    }
});

// User-specific send media (image, video, document) via URL
app.post('/users/:userId/send-media', async (req, res) => {
    const { userId } = req.params;
    const { to, phoneNumber, mediaUrl, mediaType, caption, filename, mimetype } = req.body;
    const targetNumber = to || phoneNumber;
    const session = getSession(userId);

    if (!session || !session.isReady || !session.sock) {
        return res.json({ success: false, error: 'WhatsApp não está conectado' });
    }

    if (!mediaUrl) {
        return res.json({ success: false, error: 'mediaUrl é obrigatório' });
    }

    try {
        // Resolver número
        let jid;
        if (targetNumber.includes('@lid')) {
            const cleanedNumber = await cleanPhoneNumber(targetNumber, null, session);
            jid = cleanedNumber.includes('@') ? cleanedNumber : `${cleanedNumber}@s.whatsapp.net`;
        } else if (targetNumber.includes('@g.us')) {
            jid = targetNumber;
        } else {
            jid = await resolveWhatsAppJid(targetNumber, session);
        }

        let baileysMessage;
        const effectiveType = mediaType || 'image';

        if (effectiveType === 'video') {
            // Download video and send as buffer for better compatibility
            const mediaRes = await fetch(mediaUrl);
            if (!mediaRes.ok) throw new Error('Falha ao baixar vídeo');
            const arrayBuffer = await mediaRes.arrayBuffer();
            const mediaBuffer = Buffer.from(arrayBuffer);
            baileysMessage = {
                video: mediaBuffer,
                mimetype: mimetype || mediaRes.headers.get('content-type') || 'video/mp4',
                caption: caption || ''
            };
        } else if (effectiveType === 'document') {
            const mediaRes = await fetch(mediaUrl);
            if (!mediaRes.ok) throw new Error('Falha ao baixar documento');
            const arrayBuffer = await mediaRes.arrayBuffer();
            const mediaBuffer = Buffer.from(arrayBuffer);
            baileysMessage = {
                document: mediaBuffer,
                fileName: filename || 'arquivo',
                mimetype: mimetype || mediaRes.headers.get('content-type') || 'application/pdf',
                caption: caption || ''
            };
        } else {
            // image (default)
            const mediaRes = await fetch(mediaUrl);
            if (!mediaRes.ok) throw new Error('Falha ao baixar imagem');
            const arrayBuffer = await mediaRes.arrayBuffer();
            const mediaBuffer = Buffer.from(arrayBuffer);
            baileysMessage = {
                image: mediaBuffer,
                mimetype: mimetype || mediaRes.headers.get('content-type') || 'image/jpeg',
                caption: caption || ''
            };
        }

        const sentMessage = await session.sock.sendMessage(jid, baileysMessage);

        const cleanJidNumber = jid.replace(/@.*$/, '');
        const messageObj = {
            id: sentMessage.key.id,
            from: session.sock.user.id,
            to: jid,
            body: caption || `[${effectiveType}]`,
            type: effectiveType,
            timestamp: Date.now(),
            isFromMe: true,
            contact: {
                id: jid,
                name: cleanJidNumber,
                pushname: '',
                number: cleanJidNumber
            }
        };

        session.messagesList.unshift(messageObj);
        if (session.messagesList.length > 100) session.messagesList.pop();

        if (!session.chatMessages.has(jid)) session.chatMessages.set(jid, []);
        const chatMsgs = session.chatMessages.get(jid);
        chatMsgs.unshift(messageObj);
        if (chatMsgs.length > 50) chatMsgs.pop();

        sendEventToUserClients(userId, 'new_message', messageObj);
        sendEventToUserClients(userId, 'chat_message_update', { chatId: jid, message: messageObj });

        console.log(`✅ [${userId}] Mídia (${effectiveType}) enviada para ${jid}`);
        res.json({ success: true, message: `${effectiveType} enviado com sucesso` });
    } catch (error) {
        console.error(`❌ [${userId}] Erro ao enviar mídia:`, error);
        res.json({ success: false, error: 'Erro ao enviar mídia: ' + (error.message || '') });
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

                    <div style="background: #e8f4fd; padding: 15px; margin: 10px 0; border-radius: 5px;">
                        <h4>📸 Instagram Webhook:</h4>
                        <ul>
                            <li><strong>GET /instagram-webhook</strong> - Handshake Meta Developers</li>
                            <li><strong>POST /instagram-webhook</strong> - Receber mensagens DM</li>
                        </ul>
                        <p><em>🔐 Requer: INSTAGRAM_APP_SECRET e INSTAGRAM_VERIFY_TOKEN</em></p>
                    </div>

                    <h4>🎯 Resolução de @lid:</h4>
                    <ul>
                        <li>POST /resolve-lid - Resolver número @lid para telefone real</li>
                        <li>GET /lid-mappings - Ver mapeamentos @lid ↔ telefone</li>
                    </ul>

                    <h4>🛠️ Utilitários:</h4>
                    <ul>
                        <li>GET /health - Status de saúde da API</li>
                        <li>GET /events - Eventos globais (SSE)</li>
                        <li>DELETE /users/{userId}/reset - Resetar sessão do usuário</li>
                    </ul>

                    <div style="background: #f8d7da; padding: 15px; margin: 10px 0; border-radius: 5px;">
                        <h4>⚠️ Rotas de Teste (Desenvolvimento):</h4>
                        <ul>
                            <li>POST /test-notifications - Testar notificações</li>
                            <li>GET /events/today - Eventos do dia</li>
                            <li>POST /test-daily-summary - Testar resumo diário</li>
                        </ul>
                    </div>

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

        // 🎯 PRIMEIRO: Verificar se é um @lid conhecido
        if (phoneNumber.includes('@lid') && lidToPhoneMapping[phoneNumber]) {
            const realPhone = lidToPhoneMapping[phoneNumber];
            console.log(`📱 @lid detectado! Buscando org pelo número real: ${phoneNumber} → ${realPhone}`);
            
            const { data: org, error } = await supabase
                .from('organizations')
                .select('*')
                .eq('admin_phone', realPhone)
                .single();

            if (org && !error) {
                console.log('✅ Organização encontrada via @lid mapping:', org.name);
                return org;
            }
        }

        // Buscar na tabela organizations por admin_phone (números normais)
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

        // 🔄 EXTRA: Verificar se algum dos números testados tem @lid associado
        for (const testNumber of numbersToTest) {
            const associatedLid = phoneToLidMapping[testNumber];
            if (associatedLid) {
                console.log(`🔍 Testando @lid associado: ${testNumber} → ${associatedLid}`);
                // Se encontrar match com @lid, significa que reconhece ambos
                console.log(`✅ Número ${testNumber} tem @lid associado: ${associatedLid}`);
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

// =====================================================================
// NORMALIZADOR DEFINITIVO DE TELEFONE BRASILEIRO
// Entrada: qualquer formato (com/sem 55, com/sem 9, com/sem DDD, com máscara)
// Saída: array de variações para testar, ordenadas por probabilidade
// =====================================================================
function getBrazilianPhoneVariations(phone) {
    if (!phone) return [];

    // 1. Limpar: remover tudo que não é dígito
    let digits = phone.replace(/\D/g, '');

    // 2. Se já tem @s.whatsapp.net ou @c.us, extrair só os dígitos
    if (phone.includes('@')) {
        digits = phone.replace(/@.*$/, '').replace(/\D/g, '');
    }

    // 3. Remover código do país (55) se presente
    let withoutCountry = digits;
    if (digits.startsWith('55') && digits.length >= 12) {
        withoutCountry = digits.substring(2);
    }

    // 4. Separar DDD e número
    let ddd = '';
    let number = withoutCountry;

    if (withoutCountry.length >= 10) {
        ddd = withoutCountry.substring(0, 2);
        number = withoutCountry.substring(2);
    }

    // 5. Gerar todas as variações possíveis
    const variations = new Set();

    if (ddd && number) {
        // Número com 9 dígitos (celular moderno): DDD + 9XXXXXXXX
        if (number.length === 9 && number.charAt(0) === '9') {
            const withNine = ddd + number;           // ex: 83981575146  (11 dígitos)
            const withoutNine = ddd + number.substring(1); // ex: 8381575146   (10 dígitos)

            variations.add('55' + withNine);          // 5583981575146 (13) ← mais provável
            variations.add('55' + withoutNine);        // 558381575146  (12)
            variations.add(withNine);                  // 83981575146   (11)
            variations.add(withoutNine);               // 8381575146    (10)
        }
        // Número com 8 dígitos (sem 9): DDD + XXXXXXXX
        else if (number.length === 8) {
            const withNine = ddd + '9' + number;     // ex: 83981575146
            const withoutNine = ddd + number;         // ex: 8381575146

            variations.add('55' + withNine);           // 5583981575146 (13) ← mais provável
            variations.add('55' + withoutNine);        // 558381575146  (12)
            variations.add(withNine);                  // 83981575146   (11)
            variations.add(withoutNine);               // 8381575146    (10)
        }
        // Número com 9 dígitos mas sem 9 na frente (raro, pode ser fixo longo)
        else if (number.length === 9 && number.charAt(0) !== '9') {
            variations.add('55' + ddd + number);
            variations.add(ddd + number);
        }
        // Qualquer outro comprimento
        else {
            variations.add('55' + ddd + number);
            variations.add(ddd + number);
        }
    } else {
        // Sem DDD identificável - usar o número como está
        if (!digits.startsWith('55')) {
            variations.add('55' + digits);
        }
        variations.add(digits);
    }

    // Também incluir o input original limpo se for diferente
    if (digits.length >= 10) {
        variations.add(digits);
    }

    return [...variations];
}

// Resolve o JID correto testando variações no WhatsApp
// Retorna o JID que o WhatsApp reconhece, ou o mais provável como fallback
async function resolveWhatsAppJid(phone, session) {
    const variations = getBrazilianPhoneVariations(phone);

    if (variations.length === 0) {
        // Fallback: limpar e adicionar 55
        const clean = phone.replace(/\D/g, '');
        return clean.startsWith('55') ? `${clean}@s.whatsapp.net` : `55${clean}@s.whatsapp.net`;
    }

    console.log(`📱 Testando ${variations.length} variações para ${phone}:`, variations);

    // Tentar onWhatsApp para encontrar o número correto
    if (session?.sock?.onWhatsApp) {
        try {
            // Testar todas as variações de uma vez (mais eficiente)
            const jidsToTest = variations.map(v => `${v}@s.whatsapp.net`);
            for (const jid of jidsToTest) {
                try {
                    const result = await session.sock.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
                    if (result && result.length > 0 && result[0].exists) {
                        console.log(`✅ Número encontrado no WhatsApp: ${result[0].jid}`);
                        return result[0].jid;
                    }
                } catch (e) {
                    // Silently continue to next variation
                }
            }
            console.log(`⚠️ Nenhuma variação encontrada no WhatsApp, usando primeira opção: ${variations[0]}`);
        } catch (error) {
            console.log(`⚠️ Erro no onWhatsApp, usando primeira variação: ${variations[0]}`);
        }
    }

    // Fallback: usar a primeira variação (mais provável: 55+DDD+9+número)
    return `${variations[0]}@s.whatsapp.net`;
}

// Wrapper simples para compatibilidade - retorna o número mais provável
function normalizePhone(phone) {
    const variations = getBrazilianPhoneVariations(phone);
    return variations.length > 0 ? variations[0] : phone.replace(/\D/g, '');
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

// =====================================================================
// FOLLOW-UP CRON ANTIGO - REMOVIDO (usando processFollowupsForAllOrganizations)
// =====================================================================
async function processFollowupsCron_DISABLED() {
    try {
        const { data: executions, error } = await supabase
            .from('lead_followup_executions')
            .select('*, leads(nome_completo, email, telefone, whatsapp), lead_followup_sequences(steps, nome_sequencia, horario_envio_inicio, horario_envio_fim)')
            .eq('status', 'active')
            .lt('proxima_execucao', new Date().toISOString())
            .limit(20);

        if (error) {
            console.error('❌ Follow-up CRON: Erro ao buscar:', error.message);
            return;
        }
        if (!executions || executions.length === 0) return;

        console.log(`📋 Follow-up CRON: ${executions.length} execuções pendentes`);

        for (const execution of executions) {
            try {
                const lead = execution.leads;
                const sequence = execution.lead_followup_sequences;
                if (!lead || !sequence) continue;

                const steps = sequence.steps || [];
                const now = new Date();
                const currentHour = now.getHours();
                const startHour = parseInt((sequence.horario_envio_inicio || '0').split(':')[0]);
                const endHour = parseInt((sequence.horario_envio_fim || '23').split(':')[0]);
                if (currentHour < startHour || currentHour >= endHour) continue;

                let idx = execution.step_atual;
                let touchpoints = execution.total_touchpoints || 0;
                let executed = [...(execution.steps_executados || [])];
                let sentCount = 0;

                while (idx < steps.length && sentCount < 5) {
                    const step = steps[idx];
                    if (!step) break;

                    if (sentCount > 0) {
                        const delayMs = ((step.delay_days || 0) * 86400000) + ((step.delay_hours || 0) * 3600000) + ((step.delay_minutes || 0) * 60000);
                        if (delayMs > 0) {
                            await supabase.from('lead_followup_executions').update({
                                step_atual: idx, total_touchpoints: touchpoints, steps_executados: executed,
                                proxima_execucao: new Date(Date.now() + delayMs).toISOString(), updated_at: new Date().toISOString()
                            }).eq('id', execution.id);
                            break;
                        }
                    }

                    let sent = false;
                    const phone = lead.telefone || lead.whatsapp;

                    if (step.tipo_acao === 'whatsapp' && phone) {
                        let msg = (step.conteudo || '')
                            .replace(/\{\{nome\}\}/g, lead.nome_completo || '')
                            .replace(/\{\{email\}\}/g, lead.email || '')
                            .replace(/\{\{telefone\}\}/g, phone || '');

                        const cleanPhone = phone.replace(/\D/g, '');
                        let session = null;
                        for (const [key, s] of userSessions) {
                            if (s && s.isReady && s.sock) {
                                session = s;
                                break;
                            }
                        }

                        if (session) {
                            try {
                                const jid = await resolveWhatsAppJid(cleanPhone, session);
                                if (step.media_url && step.media_type) {
                                    const mediaMsg = step.media_type === 'image'
                                        ? { image: { url: step.media_url }, caption: msg }
                                        : step.media_type === 'video'
                                        ? { video: { url: step.media_url }, caption: msg }
                                        : { document: { url: step.media_url }, caption: msg, fileName: step.media_filename || 'arquivo' };
                                    await session.sock.sendMessage(jid, mediaMsg);
                                } else {
                                    await session.sock.sendMessage(jid, { text: msg });
                                }
                                sent = true;
                                console.log(`✅ Follow-up step ${idx + 1}/${steps.length} → ${lead.nome_completo}`);
                            } catch (sendErr) {
                                console.error(`❌ Follow-up send error (${lead.nome_completo}):`, sendErr.message);
                            }
                        }
                    } else if (step.tipo_acao === 'email' || step.tipo_acao === 'tarefa') {
                        sent = true;
                    }

                    if (sent) {
                        touchpoints++;
                        sentCount++;
                        executed.push({ step: idx, titulo: step.titulo, executed_at: new Date().toISOString(), type: step.tipo_acao });
                        idx++;

                        if (idx >= steps.length) {
                            await supabase.from('lead_followup_executions').update({
                                step_atual: idx, status: 'completed', total_touchpoints: touchpoints,
                                steps_executados: executed, proxima_execucao: null, updated_at: new Date().toISOString()
                            }).eq('id', execution.id);
                            console.log(`🎉 Follow-up completo: ${lead.nome_completo}`);
                            break;
                        }
                    } else {
                        await supabase.from('lead_followup_executions').update({
                            step_atual: idx, total_touchpoints: touchpoints, steps_executados: executed, updated_at: new Date().toISOString()
                        }).eq('id', execution.id);
                        break;
                    }
                }

                // Salvar estado se ainda tem steps e enviou algo
                if (idx < steps.length && sentCount > 0 && idx !== execution.step_atual) {
                    const nextStep = steps[idx];
                    const nextDelay = nextStep ? ((nextStep.delay_days || 0) * 86400000) + ((nextStep.delay_hours || 0) * 3600000) + ((nextStep.delay_minutes || 0) * 60000) : 60000;
                    await supabase.from('lead_followup_executions').update({
                        step_atual: idx, total_touchpoints: touchpoints, steps_executados: executed,
                        proxima_execucao: new Date(Date.now() + Math.max(nextDelay, 60000)).toISOString(), updated_at: new Date().toISOString()
                    }).eq('id', execution.id);
                }
            } catch (execErr) {
                console.error('❌ Follow-up exec error:', execErr.message);
            }
        }
    } catch (err) {
        console.error('❌ Follow-up CRON error:', err.message);
    }
}

// Endpoint manual antigo removido — usando o de processFollowupsForAllOrganizations abaixo

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

    // Cleanup expired community stories every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        try {
            await supabase.query(`SELECT cleanup_expired_stories()`);
            console.log('🧹 Cleaned up expired community stories');
        } catch (err) {
            console.error('❌ Story cleanup error:', err.message);
        }
    });

    // Follow-up CRON antigo removido — usando processFollowupsForAllOrganizations

    console.log('⏰ Cron jobs configurados:');
    console.log('   - Verificação de lembretes a cada 2 minutos (30min antes)');
    console.log('   - Resumo diário às 7h UTC (10h São Paulo)');
    console.log('   - Cleanup de stories expirados a cada 6 horas');
    console.log('   - Follow-up automático a cada 30 segundos (via processFollowupsForAllOrganizations)');

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
                database: 'PostgreSQL direct (pg)',
                host: process.env.POSTGRES_HOST || 'postgres'
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

// ========================
// FOLLOW-UP AUTOMÁTICO MULTI-ORG
// ========================

let isProcessingFollowups = false;

async function processFollowupsForAllOrganizations() {
    if (isProcessingFollowups) {
        console.log('⏳ Follow-ups já estão sendo processados, pulando...');
        return { processed: 0, skipped: true };
    }
    isProcessingFollowups = true;

    let processed = 0;
    let errors = 0;

    try {
        // TZ=America/Sao_Paulo já está configurado no Docker, então new Date() retorna horário de SP
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0=domingo, 6=sábado

        console.log(`\n🔄 [FOLLOW-UP] Processando follow-ups... ${now.toLocaleString('pt-BR')} (H:${currentHour}:${currentMinute})`);

        // Buscar execuções pendentes
        const { data: executions, error: fetchError } = await supabase
            .from('lead_followup_executions')
            .select(`
                *,
                lead:leads(id, nome_completo, telefone, empresa, organization_id, email),
                sequence:lead_followup_sequences(id, nome_sequencia, steps, horario_envio_inicio, horario_envio_fim, ativo, pausar_fim_semana, pausar_feriados, timezone)
            `)
            .eq('status', 'active')
            .lte('proxima_execucao', now.toISOString());

        if (fetchError) {
            console.error('❌ [FOLLOW-UP] Erro ao buscar execuções:', fetchError);
            return { processed: 0, errors: 1 };
        }

        if (!executions || executions.length === 0) {
            console.log('✅ [FOLLOW-UP] Nenhum follow-up pendente.');
            return { processed: 0, errors: 0 };
        }

        console.log(`📋 [FOLLOW-UP] ${executions.length} execuções pendentes encontradas.`);

        for (const exec of executions) {
            try {
                const { lead, sequence } = exec;

                // Validações
                if (!lead || !sequence) {
                    console.log(`⚠️ [FOLLOW-UP] Execução ${exec.id}: lead ou sequência não encontrados, pulando.`);
                    continue;
                }
                if (!sequence.ativo) {
                    console.log(`⏸️ [FOLLOW-UP] Sequência "${sequence.nome_sequencia}" desativada, pulando.`);
                    continue;
                }
                if (!lead.telefone) {
                    console.log(`⚠️ [FOLLOW-UP] Lead "${lead.nome_completo}" sem telefone, pulando.`);
                    continue;
                }

                const orgId = lead.organization_id;
                if (!orgId) {
                    console.log(`⚠️ [FOLLOW-UP] Lead "${lead.nome_completo}" sem organization_id, pulando.`);
                    continue;
                }

                // Verificar se tem sessão WhatsApp ativa pra essa org
                const orgSession = userSessions.get(orgId);
                if (!orgSession || !orgSession.sock || !orgSession.isReady) {
                    console.log(`📵 [FOLLOW-UP] Org ${orgId} sem WhatsApp ativo, pulando.`);
                    continue;
                }

                // Verificar fim de semana
                if (sequence.pausar_fim_semana && (dayOfWeek === 0 || dayOfWeek === 6)) {
                    // Reagendar para segunda-feira no horário de início
                    const monday = new Date(now);
                    const daysUntilMonday = dayOfWeek === 0 ? 1 : 2;
                    monday.setDate(monday.getDate() + daysUntilMonday);
                    const [startH, startM] = (sequence.horario_envio_inicio || '09:00').split(':').map(Number);
                    monday.setHours(startH, startM, 0, 0);

                    await supabase.from('lead_followup_executions').update({
                        proxima_execucao: monday.toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('id', exec.id);

                    console.log(`📅 [FOLLOW-UP] Fim de semana — reagendado para ${monday.toLocaleString('pt-BR')}`);
                    continue;
                }

                // Verificar janela de horário
                const [startH, startM] = (sequence.horario_envio_inicio || '09:00').split(':').map(Number);
                const [endH, endM] = (sequence.horario_envio_fim || '18:00').split(':').map(Number);
                const currentTimeMinutes = currentHour * 60 + currentMinute;
                const startTimeMinutes = startH * 60 + startM;
                const endTimeMinutes = endH * 60 + endM;

                if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes >= endTimeMinutes) {
                    // Fora do horário — reagendar para amanhã no horário de início
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(startH, startM, 0, 0);

                    await supabase.from('lead_followup_executions').update({
                        proxima_execucao: tomorrow.toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('id', exec.id);

                    console.log(`🕐 [FOLLOW-UP] Fora do horário (${currentHour}:${String(currentMinute).padStart(2,'0')}) — reagendado para amanhã ${startH}:${String(startM).padStart(2,'0')}`);
                    continue;
                }

                // Pegar step atual e processar MÚLTIPLOS steps se delay = 0
                let steps = sequence.steps || [];
                if (typeof steps === 'string') { try { steps = JSON.parse(steps); } catch(e) { steps = []; } }
                if (!Array.isArray(steps)) steps = [];

                let currentStepIndex = exec.step_atual || 0;
                let totalTouchpoints = exec.total_touchpoints || 0;

                let rawStepsExec = exec.steps_executados || [];
                if (typeof rawStepsExec === 'string') { try { rawStepsExec = JSON.parse(rawStepsExec); } catch(e) { rawStepsExec = []; } }
                if (!Array.isArray(rawStepsExec)) rawStepsExec = [];
                let stepsExecutados = [...rawStepsExec];

                let stepsSentThisRun = 0;
                const MAX_STEPS_PER_RUN = 5;

                if (currentStepIndex >= steps.length) {
                    await supabase.from('lead_followup_executions').update({
                        status: 'completed',
                        updated_at: new Date().toISOString()
                    }).eq('id', exec.id);
                    console.log(`✅ [FOLLOW-UP] Sequência completada para lead "${lead.nome_completo}"`);
                    continue;
                }

                // LOOP: processar steps consecutivos com delay 0
                while (currentStepIndex < steps.length && stepsSentThisRun < MAX_STEPS_PER_RUN) {
                    const step = steps[currentStepIndex];
                    if (!step) break;

                    // Para steps após o primeiro neste run, verificar delay
                    if (stepsSentThisRun > 0) {
                        const stepDelayMs = (
                            (step.delay_days || 0) * 86400000 +
                            (step.delay_hours || 0) * 3600000 +
                            (step.delay_minutes || 0) * 60000
                        );

                        if (stepDelayMs > 0) {
                            // Tem delay > 0, agendar e parar
                            const nextExec = new Date(Date.now() + stepDelayMs);

                            // Se cair fora do horário, ajustar
                            const nextExecHour = nextExec.getHours();
                            if (nextExecHour < startH || nextExecHour >= endH) {
                                nextExec.setHours(startH, startM, 0, 0);
                                if (nextExecHour >= endH) {
                                    nextExec.setDate(nextExec.getDate() + 1);
                                }
                            }

                            await supabase.from('lead_followup_executions').update({
                                step_atual: currentStepIndex,
                                proxima_execucao: nextExec.toISOString(),
                                steps_executados: stepsExecutados,
                                total_touchpoints: totalTouchpoints,
                                updated_at: new Date().toISOString()
                            }).eq('id', exec.id);

                            const delayDesc = [
                                step.delay_days ? `${step.delay_days}d` : '',
                                step.delay_hours ? `${step.delay_hours}h` : '',
                                step.delay_minutes ? `${step.delay_minutes}min` : ''
                            ].filter(Boolean).join(' ');
                            console.log(`⏳ [FOLLOW-UP] ${stepsSentThisRun} step(s) enviados para "${lead.nome_completo}" — próximo em ${delayDesc}`);
                            break;
                        }
                        // delay é 0 → continuar processando
                    }

                    // Substituir variáveis no conteúdo
                    let messageContent = (step.conteudo || '').replace(/\{\{nome\}\}/gi, lead.nome_completo || '')
                        .replace(/\{\{empresa\}\}/gi, lead.empresa || '')
                        .replace(/\{\{email\}\}/gi, lead.email || '')
                        .replace(/\{\{telefone\}\}/gi, lead.telefone || '');

                    // Montar mensagem Baileys baseado no tipo de mídia
                    let baileysMessage;
                    if (step.media_url && step.media_type === 'image') {
                        baileysMessage = { image: { url: step.media_url }, caption: messageContent };
                    } else if (step.media_url && step.media_type === 'video') {
                        baileysMessage = { video: { url: step.media_url }, caption: messageContent };
                    } else if (step.media_url && step.media_type === 'document') {
                        baileysMessage = {
                            document: { url: step.media_url },
                            fileName: step.media_filename || 'arquivo',
                            mimetype: step.media_mimetype || 'application/pdf',
                            caption: messageContent
                        };
                    } else {
                        baileysMessage = { text: messageContent };
                    }

                    // Enviar mensagem
                    const sent = await sendWhatsAppMessageForOrganization(orgId, lead.telefone, baileysMessage);

                    if (!sent) {
                        console.error(`❌ [FOLLOW-UP] Falha ao enviar step ${currentStepIndex + 1} para "${lead.nome_completo}"`);
                        // Salvar estado e sair
                        await supabase.from('lead_followup_executions').update({
                            step_atual: currentStepIndex,
                            steps_executados: stepsExecutados,
                            total_touchpoints: totalTouchpoints,
                            updated_at: new Date().toISOString()
                        }).eq('id', exec.id);
                        errors++;
                        break;
                    }

                    // Step enviado com sucesso
                    totalTouchpoints++;
                    stepsSentThisRun++;
                    stepsExecutados.push({
                        step: currentStepIndex,
                        titulo: step.titulo,
                        executado_em: new Date().toISOString(),
                        tipo: step.tipo_acao
                    });

                    console.log(`✅ [FOLLOW-UP] Step ${currentStepIndex + 1}/${steps.length} enviado para "${lead.nome_completo}"`);
                    currentStepIndex++;

                    // Se era o último step, marcar como completo
                    if (currentStepIndex >= steps.length) {
                        await supabase.from('lead_followup_executions').update({
                            status: 'completed',
                            step_atual: currentStepIndex,
                            steps_executados: stepsExecutados,
                            total_touchpoints: totalTouchpoints,
                            updated_at: new Date().toISOString()
                        }).eq('id', exec.id);
                        console.log(`🏁 [FOLLOW-UP] Sequência COMPLETA para "${lead.nome_completo}" (${steps.length} steps, ${stepsSentThisRun} enviados agora)`);
                        break;
                    }

                    // Rate limit entre steps: 2s
                    await new Promise(r => setTimeout(r, 2000));

                    // O while vai reavaliar: o próximo step tem delay 0? Se sim, continua enviando.
                }

                if (stepsSentThisRun > 0) {
                    processed++;
                    // Atualizar leads_atingidos na sequência (apenas quando step 0 foi enviado)
                    if (exec.step_atual === 0) {
                        try {
                            const { data: seqData } = await supabase
                                .from('lead_followup_sequences')
                                .select('leads_atingidos')
                                .eq('id', exec.sequence_id)
                                .single();
                            await supabase.from('lead_followup_sequences').update({
                                leads_atingidos: (seqData?.leads_atingidos || 0) + 1,
                                updated_at: new Date().toISOString()
                            }).eq('id', exec.sequence_id);
                        } catch (_) {}
                    }
                }

                // Rate limit entre leads: 3s
                await new Promise(r => setTimeout(r, 3000));

            } catch (stepError) {
                console.error(`❌ [FOLLOW-UP] Erro ao processar execução ${exec.id}:`, stepError);
                errors++;
            }
        }

        console.log(`✅ [FOLLOW-UP] Processamento completo: ${processed} enviados, ${errors} erros.`);
        return { processed, errors };

    } catch (error) {
        console.error('❌ [FOLLOW-UP] Erro geral:', error);
        return { processed: 0, errors: 1 };
    } finally {
        isProcessingFollowups = false;
    }
}

// Processar follow-ups a cada 30 segundos para envios imediatos serem rápidos
cron.schedule('*/30 * * * * *', processFollowupsForAllOrganizations);

// Endpoints de follow-up
app.post('/process-followups', async (req, res) => {
    try {
        const result = await processFollowupsForAllOrganizations();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/followup-status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lead_followup_executions')
            .select('status')
            .then(({ data }) => {
                const counts = { active: 0, completed: 0, responded: 0, failed: 0 };
                (data || []).forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
                return { data: counts, error: null };
            });
        res.json({ success: true, stats: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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

// ================ INSTAGRAM WEBHOOK ROUTES ================

/**
 * GET /instagram-webhook - Handshake inicial com a Meta
 * Verificação do webhook para configurar no Meta Developers
 */
app.get('/instagram-webhook', (req, res) => {
    try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        console.log('📞 Instagram webhook handshake:', { mode, token, challenge });

        if (mode === 'subscribe') {
            if (token === process.env.VERIFY_TOKEN) {
                console.log('✅ Instagram webhook - Token de verificação correto');
                return res.status(200).send(challenge);
            } else {
                console.error('❌ Instagram webhook - Token de verificação incorreto');
                return res.status(403).json({ error: 'Token de verificação incorreto' });
            }
        }

        console.error('❌ Instagram webhook - Modo inválido:', mode);
        return res.status(400).json({ error: 'Modo inválido' });

    } catch (error) {
        console.error('❌ Instagram webhook handshake error:', error);
        return res.status(500).json({ error: 'Erro interno no handshake' });
    }
});

/**
 * POST /instagram-webhook - Recebe webhooks do Instagram DM
 * Aplica validação HMAC-SHA256 e processa as mensagens
 */
app.post('/instagram-webhook', validateInstagramSignature, async (req, res) => {
    try {
        // ⚡ Responde imediatamente para a Meta (evita timeout)
        res.status(200).json({ status: 'received' });

        console.log('📨 Instagram webhook recebido:', JSON.stringify(req.body, null, 2));

        // Verifica estrutura do payload
        if (!req.body.entry || !Array.isArray(req.body.entry)) {
            console.error('❌ Instagram webhook - Payload inválido');
            return;
        }

        // Processa cada entry
        for (const entry of req.body.entry) {
            console.log('🎯 Instagram - Processando entry:', entry.id);

            if (entry.messaging && Array.isArray(entry.messaging)) {
                // Processa mensagens de forma assíncrona
                const promises = entry.messaging.map(messaging => 
                    processInstagramMessage(messaging)
                );
                await Promise.allSettled(promises);
            } else {
                console.log('ℹ️  Instagram - Entry sem messaging:', entry);
            }
        }

        console.log('✅ Instagram webhook processado com sucesso');
        
        // Log da atividade
        addNotificationLog('success', 'Instagram webhook processado', {
            entries: req.body.entry?.length || 0,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });

    } catch (error) {
        console.error('❌ Instagram webhook - Erro crítico:', error);
        // Não retorna erro para não causar reenvio desnecessário
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
                } catch (hashErr) {
                    console.warn('Failed to migrate password hash:', hashErr.message);
                }
            }
        }

        // Generate JWT token for mentorado
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
                icp_completed: mentorado.icp_completed || false,
                icp_response_id: mentorado.icp_response_id,
                avatar_url: mentorado.avatar_url,
                pontuacao_total: mentorado.pontuacao_total || 0,
            }
        });
    } catch (err) {
        console.error('Mentorado login error:', err);
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

        // Generate JWT token on validate (so mentorado keeps auth after page refresh)
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
                icp_completed: mentorado.icp_completed || false,
                icp_response_id: mentorado.icp_response_id,
                avatar_url: mentorado.avatar_url,
                pontuacao_total: mentorado.pontuacao_total || 0,
            }
        });
    } catch (err) {
        console.error('Mentorado validate error:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.listen(port, async () => {
    console.log(`🚀 WhatsApp Multi-User Baileys API rodando em https://api.medicosderesultado.com.br`);
    console.log(`👥 Sistema preparado para múltiplos usuários`);
    console.log(`📱 Acesse https://api.medicosderesultado.com.br para ver o status`);
    console.log(`🔧 Endpoints: /users/{userId}/register para registrar novos usuários`);
    console.log(`🎯 Resolver LID: POST /resolve-lid, GET /lid-mappings`);
    console.log(`📸 Instagram webhook: GET/POST /instagram-webhook`);
    console.log(`🔐 Variáveis necessárias: INSTAGRAM_APP_SECRET, INSTAGRAM_VERIFY_TOKEN`);

    // Auto-reconectar sessões WhatsApp salvas no auth_info_baileys
    try {
        const authBaseDir = path.join(__dirname, 'auth_info_baileys');
        if (fs.existsSync(authBaseDir)) {
            const sessionDirs = fs.readdirSync(authBaseDir).filter(d => d.startsWith('user_') && fs.statSync(path.join(authBaseDir, d)).isDirectory());
            console.log(`🔄 Encontradas ${sessionDirs.length} sessões WhatsApp salvas, reconectando...`);
            for (const dir of sessionDirs) {
                const userId = dir.replace('user_', '');
                // Verificar se tem creds.json (sessão válida)
                const credsPath = path.join(authBaseDir, dir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    console.log(`🔌 Reconectando sessão: ${userId}`);
                    try {
                        await connectUserToWhatsApp(userId);
                    } catch (connErr) {
                        console.error(`❌ Falha ao reconectar ${userId}:`, connErr.message);
                    }
                    // Delay entre reconexões para não sobrecarregar
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }
    } catch (autoConnErr) {
        console.error('❌ Erro no auto-reconnect:', autoConnErr.message);
    }

    // Configurar jobs após 15 segundos (dar tempo para sessões conectarem)
    setTimeout(() => {
        addNotificationLog('success', 'Sistema de notificações WhatsApp iniciado com sucesso', {
            port,
            timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
        setupCronJobs();
        setupLeadsPDFJobs();
    }, 15000);
});