// Gerenciador de configurações organizacionais
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SETTINGS_FILE = path.join(__dirname, 'organization-settings.json');

// Configuração do Supabase
const supabaseUrl = 'https://udzmlnnztzzwrphhizol.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkem1sbm56dHp6d3JwaGhpem9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MjkwNzYsImV4cCI6MjA3MzAwNTA3Nn0.KjihWHrNYxDO5ZZKpa8UYPAhw9HIU11yvAvvsNaiPZU';
const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações padrão
const DEFAULT_SETTINGS = {
  default: {
    adminPhone: '+5583996910414',
    whatsappNotifications: true,
    timezone: 'America/Sao_Paulo',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    calendarReminderHours: 24
  }
};

class OrganizationSettingsManager {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        console.log('📋 Configurações carregadas:', Object.keys(settings));
        return { ...DEFAULT_SETTINGS, ...settings };
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações:', error.message);
    }

    console.log('📋 Usando configurações padrão');
    this.saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  saveSettings(settings = this.settings) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      console.log('✅ Configurações salvas');
    } catch (error) {
      console.error('❌ Erro ao salvar configurações:', error.message);
    }
  }

  async getAdminPhone(organizationId = 'default') {
    try {
      // Primeiro tentar buscar do Supabase
      let adminPhone = await this.getAdminPhoneFromSupabase(organizationId);

      if (!adminPhone) {
        // Fallback para configurações locais
        const orgSettings = this.settings[organizationId] || this.settings.default;
        adminPhone = orgSettings?.adminPhone || '+5583996910414';
        console.log(`📱 Usando admin phone fallback para ${organizationId}: ${adminPhone}`);
      }

      // Garantir formato correto do número
      let formattedPhone = adminPhone.replace(/[^\d+]/g, '');

      // Se não começar com +55, adicionar
      if (!formattedPhone.startsWith('+55') && formattedPhone.startsWith('55')) {
        formattedPhone = '+' + formattedPhone;
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+55' + formattedPhone;
      }

      // Para WhatsApp, adicionar @s.whatsapp.net se necessário
      if (!formattedPhone.includes('@')) {
        formattedPhone = formattedPhone + '@s.whatsapp.net';
      }

      return formattedPhone;
    } catch (error) {
      console.error(`❌ Erro ao obter admin phone para ${organizationId}:`, error.message);
      return '+5583996910414@s.whatsapp.net'; // Fallback seguro
    }
  }

  async getAdminPhoneFromSupabase(organizationId = 'default') {
    try {
      console.log(`🔍 Buscando admin_phone para organização: ${organizationId}`);

      const { data, error } = await supabase
        .from('organizations')
        .select('admin_phone')
        .eq('id', organizationId)
        .single();

      if (error) {
        console.log(`⚠️ Erro ao buscar do Supabase para ${organizationId}:`, error.message);
        return null;
      }

      if (data && data.admin_phone) {
        console.log(`✅ Admin phone encontrado no Supabase para ${organizationId}: ${data.admin_phone}`);
        return data.admin_phone;
      }

      console.log(`📭 Nenhum admin_phone encontrado no Supabase para ${organizationId}`);
      return null;
    } catch (error) {
      console.error(`❌ Erro ao acessar Supabase para ${organizationId}:`, error.message);
      return null;
    }
  }

  updateAdminPhone(organizationId = 'default', adminPhone) {
    if (!this.settings[organizationId]) {
      this.settings[organizationId] = { ...DEFAULT_SETTINGS.default };
    }

    this.settings[organizationId].adminPhone = adminPhone;
    this.saveSettings();

    console.log(`📞 Admin phone atualizado para ${organizationId}: ${adminPhone}`);
    return this.getAdminPhone(organizationId);
  }

  getSettings(organizationId = 'default') {
    return this.settings[organizationId] || this.settings.default;
  }

  updateSettings(organizationId = 'default', newSettings) {
    if (!this.settings[organizationId]) {
      this.settings[organizationId] = { ...DEFAULT_SETTINGS.default };
    }

    this.settings[organizationId] = { ...this.settings[organizationId], ...newSettings };
    this.saveSettings();

    console.log(`⚙️ Configurações atualizadas para ${organizationId}:`, newSettings);
    return this.settings[organizationId];
  }
}

// Exportar instância singleton
const settingsManager = new OrganizationSettingsManager();

module.exports = {
  settingsManager,
  OrganizationSettingsManager
};