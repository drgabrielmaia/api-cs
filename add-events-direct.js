// Script para adicionar eventos de teste diretamente
// Execute: node add-events-direct.js

console.log('📅 CRIANDO EVENTOS DE TESTE...');

// Simulação dos eventos que serão inseridos
const organizationId = 'ORG_ID_AQUI'; // Será descoberto dinamicamente
const today = new Date();

const eventos = [
    {
        title: 'Call Matinal - Dr. João',
        description: 'Consulta inicial sobre procedimento. Link: https://meet.google.com/abc-123',
        start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0),
        end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0)
    },
    {
        title: 'Reunião - Paciente Maria',
        description: 'Acompanhamento pós-operatório presencial na clínica',
        start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30),
        end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 30)
    },
    {
        title: 'Call de Fechamento - Pedro',
        description: 'Finalização do tratamento. Zoom: https://zoom.us/j/987654321',
        start_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0),
        end_datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0)
    }
];

console.log('🎯 EVENTOS QUE SERÃO CRIADOS:');
eventos.forEach((evento, index) => {
    console.log(`${index + 1}. ${evento.title}`);
    console.log(`   ⏰ ${evento.start_datetime.toLocaleString('pt-BR')}`);
    console.log(`   📝 ${evento.description}\n`);
});

console.log('');
console.log('🔧 EXECUTE ESTE SQL NO SUPABASE:');
console.log('');

// Gerar SQL para inserção
const sqlCommands = eventos.map((evento, index) => {
    const startISO = evento.start_datetime.toISOString();
    const endISO = evento.end_datetime.toISOString();
    
    return `-- Evento ${index + 1}: ${evento.title}
INSERT INTO calendar_events (
    title, 
    description, 
    start_datetime, 
    end_datetime, 
    organization_id
) VALUES (
    '${evento.title}',
    '${evento.description}',
    '${startISO}',
    '${endISO}',
    (SELECT id FROM organizations WHERE admin_phone = '83921485650')
);`;
}).join('\n\n');

console.log(sqlCommands);

console.log('');
console.log('✅ Copie e cole esse SQL no Supabase SQL Editor!');