// Script para verificar campos de data nas vendas
console.log('📅 VERIFICAÇÃO DE CAMPOS DE DATA NAS VENDAS\n');

const SUPABASE_URL = 'https://udzmlnnztzzwrphhizol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';

async function checkVendasDates() {
    try {
        console.log('📋 Buscando leads vendidos para verificar campos de data...');
        const response = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=nome_completo,valor_vendido,data_venda,created_at,updated_at,data_fechamento,data_primeiro_contato&status=eq.vendido&limit=5`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const vendas = await response.json();
            console.log(`✅ ${vendas.length} vendas encontradas:\n`);
            
            vendas.forEach((venda, index) => {
                console.log(`${index + 1}. ${venda.nome_completo || 'Sem nome'}`);
                console.log(`   Valor: R$ ${venda.valor_vendido}`);
                console.log(`   data_venda: ${venda.data_venda || 'NULL'}`);
                console.log(`   created_at: ${venda.created_at}`);
                console.log(`   updated_at: ${venda.updated_at}`);
                console.log(`   data_fechamento: ${venda.data_fechamento || 'NULL'}`);
                console.log(`   data_primeiro_contato: ${venda.data_primeiro_contato || 'NULL'}`);
                console.log('');
            });
            
            // Verificar qual campo tem dados úteis
            const camposComDados = {
                data_venda: 0,
                created_at: 0,
                updated_at: 0,
                data_fechamento: 0,
                data_primeiro_contato: 0
            };
            
            vendas.forEach(venda => {
                if (venda.data_venda) camposComDados.data_venda++;
                if (venda.created_at) camposComDados.created_at++;
                if (venda.updated_at) camposComDados.updated_at++;
                if (venda.data_fechamento) camposComDados.data_fechamento++;
                if (venda.data_primeiro_contato) camposComDados.data_primeiro_contato++;
            });
            
            console.log('📊 Resumo de campos com dados:');
            Object.entries(camposComDados).forEach(([campo, count]) => {
                console.log(`   ${campo}: ${count}/${vendas.length}`);
            });
            
            // Recomendação
            console.log('\n💡 RECOMENDAÇÃO:');
            if (camposComDados.data_venda > 0) {
                console.log('   ✅ Usar data_venda (tem dados!)');
            } else if (camposComDados.data_fechamento > 0) {
                console.log('   ✅ Usar data_fechamento como alternativa');
            } else {
                console.log('   ⚠️ Usar created_at ou updated_at como fallback');
            }
            
        } else {
            console.log('❌ Erro:', response.status, await response.text());
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
    }
}

checkVendasDates().catch(console.error);