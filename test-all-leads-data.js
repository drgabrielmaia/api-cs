// Script para verificar todos os dados de leads
console.log('🔍 VERIFICAÇÃO COMPLETA DOS LEADS\n');

const SUPABASE_URL = 'https://udzmlnnztzzwrphhizol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';

async function checkAllLeadsData() {
    try {
        // Verificar organização do admin +5583996910414
        console.log('🏢 Testando organização do admin +5583996910414...');
        
        const orgId = '9c8c0033-15ea-4e33-a55f-28d81a19693b'; // Admin Organization
        
        // 1. Buscar todos os leads desta organização
        console.log(`\n📋 1. Buscando todos os leads da organização ${orgId}...`);
        const allLeadsResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=*&organization_id=eq.${orgId}&limit=10`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (allLeadsResponse.ok) {
            const leads = await allLeadsResponse.json();
            console.log(`✅ ${leads.length} leads encontrados:`);
            
            leads.forEach((lead, index) => {
                console.log(`\n   ${index + 1}. ${lead.nome_completo || 'Sem nome'}`);
                console.log(`      Status: ${lead.status || 'N/A'}`);
                console.log(`      Valor vendido: R$ ${lead.valor_vendido || 0}`);
                console.log(`      Data venda: ${lead.data_venda || 'N/A'}`);
                console.log(`      Created: ${lead.created_at}`);
            });
            
            // Contar por status
            const statusCount = {};
            leads.forEach(lead => {
                statusCount[lead.status] = (statusCount[lead.status] || 0) + 1;
            });
            
            console.log('\n📊 Resumo por status:');
            Object.entries(statusCount).forEach(([status, count]) => {
                console.log(`   - ${status}: ${count}`);
            });
            
            // Verificar leads com valor_vendido > 0
            const leadsComValor = leads.filter(lead => (lead.valor_vendido || 0) > 0);
            console.log(`\n💰 Leads com valor_vendido > 0: ${leadsComValor.length}`);
            leadsComValor.forEach(lead => {
                console.log(`   - ${lead.nome_completo}: R$ ${lead.valor_vendido} (status: ${lead.status})`);
            });
            
        } else {
            console.log(`❌ Erro ao buscar leads: ${allLeadsResponse.status}`);
            console.log(await allLeadsResponse.text());
        }
        
        // 2. Verificar se há leads em outras organizações
        console.log('\n🔄 2. Verificando leads em outras organizações...');
        const otherOrgsResponse = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=organization_id,status,valor_vendido&valor_vendido=gt.0&limit=10`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (otherOrgsResponse.ok) {
            const otherLeads = await otherOrgsResponse.json();
            console.log(`✅ ${otherLeads.length} leads com valor > 0 em todas organizações:`);
            otherLeads.forEach(lead => {
                console.log(`   - Org: ${lead.organization_id}, Status: ${lead.status}, Valor: R$ ${lead.valor_vendido}`);
            });
        }
        
    } catch (error) {
        console.log('❌ Erro:', error.message);
    }
}

checkAllLeadsData().catch(console.error);