// Script para verificar se a tabela dividas existe
console.log('🔍 TESTE DA TABELA DIVIDAS\n');

const SUPABASE_URL = 'https://udzmlnnztzzwrphhizol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';

async function checkDividasTable() {
    try {
        console.log('📋 Testando tabela "dividas"...');
        const response = await fetch(`${SUPABASE_URL}/rest/v1/dividas?select=*&limit=1`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Tabela "dividas" existe!');
            if (data && data.length > 0) {
                console.log('📝 Campos disponíveis:', Object.keys(data[0]).join(', '));
                console.log('📊 Exemplo de registro:', data[0]);
            } else {
                console.log('📝 Tabela existe mas está vazia');
            }
        } else {
            console.log(`❌ Tabela "dividas" não existe (${response.status})`);
            console.log('❌ Resposta:', await response.text());
        }
    } catch (error) {
        console.log('❌ Erro ao verificar tabela "dividas":', error.message);
    }

    console.log('\n🔍 Verificando se há alguma tabela com nome similar...');
    
    // Testar nomes alternativos
    const alternativeNames = ['debts', 'debt', 'debitos', 'debito', 'cobranca', 'cobrancas'];
    
    for (const tableName of alternativeNames) {
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
                    console.log(`   📝 Campos: ${Object.keys(data[0]).join(', ')}`);
                }
            }
        } catch (error) {
            // Ignorar erros para nomes que não existem
        }
    }
}

checkDividasTable().catch(console.error);