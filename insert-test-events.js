// Usar o mesmo supabase do server.js
const supabase = require('./server.js').supabase || (() => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
        'https://udzmlnnztzzwrphhizol.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU'
    );
})();

async function insertTestEvents() {
    try {
        console.log('🔍 Buscando organização com admin_phone 83921485650...');
        
        // Buscar a organização
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('id, name, admin_phone')
            .eq('admin_phone', '83921485650')
            .single();

        if (orgError || !org) {
            console.error('❌ Organização não encontrada:', orgError);
            return;
        }

        console.log('✅ Organização encontrada:', org);

        // Criar eventos de teste para hoje
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const testEvents = [
            {
                title: 'Call com Lead - João Silva',
                description: 'Reunião inicial para apresentar o projeto. Link: https://meet.google.com/abc-defg-hij',
                start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0).toISOString(),
                end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0).toISOString(),
                organization_id: org.id,
                lead_id: null,
                mentorado_id: null
            },
            {
                title: 'Reunião de Follow-up - Maria Santos',
                description: 'Acompanhamento do progresso. Presencial na clínica.',
                start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30).toISOString(),
                end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 30).toISOString(),
                organization_id: org.id,
                lead_id: null,
                mentorado_id: null
            },
            {
                title: 'Call de Encerramento - Pedro Costa',
                description: 'Finalização do acompanhamento. Zoom: https://zoom.us/j/123456789',
                start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0).toISOString(),
                end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(),
                organization_id: org.id,
                lead_id: null,
                mentorado_id: null
            }
        ];

        console.log('📅 Inserindo eventos de teste...');
        
        const { data: insertedEvents, error: insertError } = await supabase
            .from('calendar_events')
            .insert(testEvents)
            .select('*');

        if (insertError) {
            console.error('❌ Erro ao inserir eventos:', insertError);
            return;
        }

        console.log('✅ Eventos inseridos com sucesso!');
        insertedEvents.forEach((event, index) => {
            console.log(`${index + 1}. ${event.title} - ${new Date(event.start_datetime).toLocaleString('pt-BR')}`);
        });

        console.log(`\n🎯 Total de ${insertedEvents.length} eventos criados para a organização "${org.name}"`);

    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

// Executar o script
insertTestEvents();