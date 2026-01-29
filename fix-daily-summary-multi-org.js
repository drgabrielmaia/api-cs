// Patch para corrigir o envio da agenda do dia para todas as organizações
// Este arquivo deve ser aplicado no baileys-server-multi.js

// 1. Adicionar função para buscar todas as organizações
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

// 2. Função para enviar mensagem usando sessão específica da organização
const sendWhatsAppMessageForOrganization = async (organizationId, phoneNumber, message) => {
  const session = userSessions.get(organizationId);

  if (!session || !session.sock || !session.isReady) {
    console.error(`❌ [${organizationId}] WhatsApp não está conectado`);
    return false;
  }

  try {
    // Garantir que o número tenha o formato correto
    let formattedNumber = phoneNumber.replace(/\D/g, '');
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

// 3. Função para enviar resumo diário para todas as organizações
const sendDailySummaryToAllOrganizations = async (summaryMessage) => {
  try {
    console.log('🌅 Enviando resumo diário para todas as organizações...');

    const organizations = await getAllOrganizationsWithWhatsApp();

    if (organizations.length === 0) {
      console.log('⚠️ Nenhuma organização com WhatsApp conectado encontrada');
      return 0;
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
    return successfulSends;

  } catch (error) {
    console.error('❌ Erro no envio para todas as organizações:', error);
    return 0;
  }
};

// 4. SUBSTITUIR a linha no resumo diário:
// DE: const sent = await sendWhatsAppMessage(await getAdminPhone(), summaryMessage);
// PARA: const sent = await sendDailySummaryToAllOrganizations(summaryMessage);

console.log('📝 Patch preparado para corrigir envio da agenda do dia para todas as organizações');
console.log('🔧 Aplicar as funções acima no baileys-server-multi.js');
console.log('📍 Substituir a linha do envio único pela nova função');

module.exports = {
  getAllOrganizationsWithWhatsApp,
  sendWhatsAppMessageForOrganization,
  sendDailySummaryToAllOrganizations
};