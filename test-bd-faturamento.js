// Script para testar se as tabelas de faturamento existem no banco
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://udzmlnnztzzwrphhizol.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU'
);

async function testFaturamentoTables() {
    console.log('🔍 TESTANDO TABELAS DE FATURAMENTO...\n');

    // 1. Testar tabela 'faturamento'
    console.log('1. 🧪 Testando tabela "faturamento"...');
    const { data: faturamento, error: faturamentoError } = await supabase
        .from('faturamento')
        .select('*')
        .limit(1);

    if (faturamentoError) {
        console.log('❌ Tabela "faturamento" NÃO EXISTE ou erro:');
        console.log('   Erro:', faturamentoError.message);
    } else {
        console.log('✅ Tabela "faturamento" existe!');
        console.log('   Campos disponíveis:', Object.keys(faturamento[0] || {}));
    }

    // 2. Testar outras possíveis tabelas financeiras
    const possibleTables = ['financeiro', 'pagamentos', 'cobrancas', 'faturas', 'billing'];
    
    for (const table of possibleTables) {
        console.log(`\n2. 🧪 Testando tabela "${table}"...`);
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (!error) {
            console.log(`✅ Tabela "${table}" existe!`);
            console.log('   Campos disponíveis:', Object.keys(data[0] || {}));
        } else {
            console.log(`❌ Tabela "${table}" não existe`);
        }
    }

    // 3. Buscar todas as tabelas disponíveis
    console.log('\n3. 📋 LISTANDO TODAS AS TABELAS DISPONÍVEIS...');
    try {
        const { data: tables, error: tablesError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');

        if (!tablesError && tables) {
            console.log('✅ Tabelas encontradas:');
            tables.forEach(table => {
                if (!table.table_name.startsWith('_') && 
                    !table.table_name.includes('auth') &&
                    !table.table_name.includes('storage')) {
                    console.log(`   - ${table.table_name}`);
                }
            });
        }
    } catch (error) {
        console.log('❌ Não foi possível listar tabelas');
    }

    // 4. Testar especificamente a organização do admin 83921485650
    console.log('\n4. 🏢 TESTANDO ORGANIZAÇÃO ESPECÍFICA...');
    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, admin_phone')
        .eq('admin_phone', '83921485650')
        .single();

    if (org && !orgError) {
        console.log('✅ Organização encontrada:', org);
        
        // Testar se há dados financeiros para esta org
        if (!faturamentoError) {
            const { data: orgFinance, error: orgFinanceError } = await supabase
                .from('faturamento')
                .select('*')
                .eq('organization_id', org.id)
                .limit(5);

            console.log('💰 Dados financeiros desta organização:');
            if (orgFinanceError) {
                console.log('❌ Erro ao buscar:', orgFinanceError.message);
            } else {
                console.log(`✅ ${orgFinance?.length || 0} registros encontrados`);
                if (orgFinance && orgFinance.length > 0) {
                    console.log('   Primeiro registro:', orgFinance[0]);
                }
            }
        }
    } else {
        console.log('❌ Organização não encontrada:', orgError?.message);
    }

    console.log('\n🏁 TESTE CONCLUÍDO!');
}

testFaturamentoTables().catch(console.error);