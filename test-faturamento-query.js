// Script para testar query de faturamento
console.log('💰 TESTE DA QUERY DE FATURAMENTO\n');

const SUPABASE_URL = 'https://udzmlnnztzzwrphhizol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';

async function testFaturamentoQuery() {
    try {
        // 1. Verificar primeiro se a organização existe
        console.log('🏢 1. Verificando organizações disponíveis...');
        const orgResponse = await fetch(`${SUPABASE_URL}/rest/v1/organizations?select=id,name,admin_phone&limit=5`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (orgResponse.ok) {
            const orgs = await orgResponse.json();
            console.log('✅ Organizações encontradas:');
            orgs.forEach((org, index) => {
                console.log(`   ${index + 1}. ${org.name} (ID: ${org.id}) - Admin: ${org.admin_phone}`);
            });
            
            if (orgs.length > 0) {
                const testOrgId = orgs[0].id;
                console.log(`\n🧪 Usando organização "${orgs[0].name}" para testes...\n`);
                
                // 2. Verificar leads com status 'vendido'
                console.log('💰 2. Verificando leads com status "vendido"...');
                const leadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=*&status=eq.vendido&organization_id=eq.${testOrgId}&limit=3`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (leadsResponse.ok) {
                    const vendidos = await leadsResponse.json();
                    console.log(`✅ ${vendidos.length} leads vendidos encontrados:`);
                    vendidos.forEach(lead => {
                        console.log(`   - ${lead.nome_completo}: R$ ${lead.valor_vendido} (${lead.data_venda})`);
                    });
                } else {
                    console.log('❌ Erro ao buscar leads vendidos:', leadsResponse.status);
                }
                
                // 3. Testar diferentes valores de status
                console.log('\n📊 3. Verificando todos os status disponíveis...');
                const allLeadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=status&organization_id=eq.${testOrgId}`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (allLeadsResponse.ok) {
                    const allLeads = await allLeadsResponse.json();
                    const statusCounts = {};
                    allLeads.forEach(lead => {
                        statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
                    });
                    
                    console.log('✅ Status encontrados:');
                    Object.entries(statusCounts).forEach(([status, count]) => {
                        console.log(`   - ${status}: ${count} leads`);
                    });
                }
                
                // 4. Verificar se existe campo data_venda
                console.log('\n📅 4. Verificando campo data_venda...');
                const dateFieldResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=data_venda,created_at&organization_id=eq.${testOrgId}&limit=3`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (dateFieldResponse.ok) {
                    const dateData = await dateFieldResponse.json();
                    console.log('✅ Campos de data:');
                    dateData.forEach((lead, index) => {
                        console.log(`   ${index + 1}. data_venda: ${lead.data_venda}, created_at: ${lead.created_at}`);
                    });
                }
                
                // 5. Testar query do mês atual
                console.log('\n📆 5. Testando query do mês atual...');
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth() + 1;
                const firstDay = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
                const lastDay = new Date(currentYear, currentMonth, 0).getDate();
                const lastDayStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
                
                console.log(`   Período: ${firstDay} até ${lastDayStr}`);
                
                const monthQueryResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=*&organization_id=eq.${testOrgId}&status=eq.vendido&data_venda=gte.${firstDay}&data_venda=lte.${lastDayStr}`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (monthQueryResponse.ok) {
                    const monthData = await monthQueryResponse.json();
                    const total = monthData.reduce((sum, lead) => sum + (lead.valor_vendido || 0), 0);
                    console.log(`✅ ${monthData.length} vendas no mês atual`);
                    console.log(`💰 Total faturado: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
                } else {
                    console.log('❌ Erro na query do mês:', monthQueryResponse.status, await monthQueryResponse.text());
                }
            }
        } else {
            console.log('❌ Erro ao buscar organizações:', orgResponse.status);
        }
        
    } catch (error) {
        console.log('❌ Erro no teste:', error.message);
    }
}

testFaturamentoQuery().catch(console.error);