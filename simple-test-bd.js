console.log('🔍 TESTE SIMPLES - VERIFICANDO ESTRUTURA DO BD');

console.log('\n📋 TABELAS QUE ESTAMOS TENTANDO ACESSAR:');
console.log('1. faturamento (para comandos faturamento/pendencia)');
console.log('2. calendar_events (para comando agenda)');
console.log('3. organizations (para verificar admin)');
console.log('4. leads (relação com faturamento)');
console.log('5. mentorados (relação com faturamento)');

console.log('\n💡 CAMPOS QUE ESTAMOS ESPERANDO NA TABELA "faturamento":');
console.log('- id');
console.log('- valor');
console.log('- data_faturamento');
console.log('- data_vencimento');
console.log('- status (pago/pendente)');
console.log('- descricao');
console.log('- organization_id');
console.log('- lead_id (opcional)');
console.log('- mentorado_id (opcional)');

console.log('\n❓ PERGUNTAS PARA VERIFICAR:');
console.log('1. A tabela "faturamento" existe?');
console.log('2. Se não, qual o nome correto?');
console.log('3. Os campos valor, status, organization_id existem?');
console.log('4. Há dados de teste nesta tabela?');

console.log('\n🎯 PRÓXIMOS PASSOS:');
console.log('1. Execute o comando "faturamento" no WhatsApp');
console.log('2. Verifique os logs para ver erros específicos');
console.log('3. Me informe qual erro aparece');

console.log('\n💭 POSSÍVEIS NOMES DE TABELAS FINANCEIRAS:');
console.log('- faturamento');
console.log('- financeiro'); 
console.log('- pagamentos');
console.log('- cobrancas');
console.log('- billing');
console.log('- invoices');
console.log('- transactions');