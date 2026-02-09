// Script para verificar estrutura real do banco de dados
console.log('🔍 CONECTANDO NO BANCO PARA VERIFICAR ESTRUTURA...\n');

// Usar fetch para fazer requisições diretas ao Supabase REST API
const SUPABASE_URL = 'https://udzmlnnztzzwrphhizol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';

async function checkTable(tableName) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Tabela "${tableName}" existe!`);
            if (data && data.length > 0) {
                console.log(`   📝 Campos disponíveis: ${Object.keys(data[0]).join(', ')}`);
                console.log(`   📊 Exemplo de registro:`, data[0]);
            } else {
                console.log('   📝 Tabela existe mas está vazia');
            }
            return true;
        } else {
            console.log(`❌ Tabela "${tableName}" não existe (${response.status})`);
            return false;
        }
    } catch (error) {
        console.log(`❌ Erro ao verificar "${tableName}":`, error.message);
        return false;
    }
}

async function checkDatabase() {
    // 1. Verificar tabelas financeiras possíveis
    console.log('💰 VERIFICANDO TABELAS FINANCEIRAS...\n');
    const financeTables = ['faturamento', 'financeiro', 'pagamentos', 'cobrancas', 'billing', 'invoices', 'transactions'];
    
    for (const table of financeTables) {
        await checkTable(table);
        console.log('');
    }

    // 2. Verificar tabelas que sabemos que existem
    console.log('📋 VERIFICANDO TABELAS CONHECIDAS...\n');
    const knownTables = ['organizations', 'calendar_events', 'leads', 'mentorados'];
    
    for (const table of knownTables) {
        await checkTable(table);
        console.log('');
    }

    // 3. Verificar organização específica
    console.log('🏢 VERIFICANDO ORGANIZAÇÃO DO ADMIN 83921485650...\n');
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/organizations?admin_phone=eq.83921485650&select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const orgs = await response.json();
            if (orgs && orgs.length > 0) {
                console.log('✅ Organização encontrada:', orgs[0]);
                console.log('📋 ID da organização:', orgs[0].id);
            } else {
                console.log('❌ Organização não encontrada com admin_phone 83921485650');
            }
        }
    } catch (error) {
        console.log('❌ Erro ao buscar organização:', error.message);
    }

    console.log('\n🏁 VERIFICAÇÃO CONCLUÍDA!');
}

checkDatabase().catch(console.error);