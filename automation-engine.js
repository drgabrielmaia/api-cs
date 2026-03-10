// =====================================================================
// WhatsApp Automation Engine
// Executes automation workflows: triggers → conditions → actions
// =====================================================================

class AutomationEngine {
    constructor() {
        this.supabase = null;
        this.getSessionFunc = null;
        this.isProcessing = false;
        this.orgCache = new Map(); // userId → orgId cache
        this.MAX_RECURSION_DEPTH = 3;
        this.MESSAGE_DELAY_MS = 2500; // delay between messages to avoid spam
    }

    initialize(supabase, getSessionFunc) {
        this.supabase = supabase;
        this.getSessionFunc = getSessionFunc;
        console.log('🤖 [AutomationEngine] Inicializado');
    }

    // =====================================================================
    // MAIN ENTRY POINT
    // =====================================================================
    async handleEvent(orgId, eventType, eventData, depth = 0) {
        if (!this.supabase || !this.getSessionFunc) return;
        if (depth >= this.MAX_RECURSION_DEPTH) {
            console.log(`⚠️ [AutomationEngine] Profundidade máxima atingida (${depth}), ignorando evento ${eventType}`);
            return;
        }

        try {
            console.log(`🤖 [AutomationEngine] Evento: ${eventType}`, { orgId, depth });

            const automations = await this.findMatchingAutomations(orgId, eventType, eventData);
            if (!automations || automations.length === 0) return;

            console.log(`🤖 [AutomationEngine] ${automations.length} automação(ões) encontrada(s) para ${eventType}`);

            for (const automation of automations) {
                try {
                    // Check cooldown
                    if (automation.cooldown_seconds > 0 && eventData.contactId) {
                        const cooldownCheck = await this.supabase.query(
                            `SELECT 1 FROM wa_automation_executions
                             WHERE automation_id = $1 AND contact_id = $2
                             AND started_at > NOW() - INTERVAL '1 second' * $3
                             LIMIT 1`,
                            [automation.id, eventData.contactId, automation.cooldown_seconds]
                        );
                        if (cooldownCheck.rows.length > 0) {
                            console.log(`⏳ [AutomationEngine] Cooldown ativo para automação "${automation.name}"`);
                            continue;
                        }
                    }

                    // Check max executions per contact
                    if (automation.max_executions_per_contact > 0 && eventData.contactId) {
                        const execCount = await this.supabase.query(
                            `SELECT COUNT(*) as cnt FROM wa_automation_executions
                             WHERE automation_id = $1 AND contact_id = $2 AND status = 'completed'`,
                            [automation.id, eventData.contactId]
                        );
                        if (parseInt(execCount.rows[0]?.cnt || 0) >= automation.max_executions_per_contact) {
                            console.log(`🔒 [AutomationEngine] Limite de execuções atingido para "${automation.name}"`);
                            continue;
                        }
                    }

                    // Get or create contact
                    let contact = null;
                    if (eventData.contactId) {
                        const contactResult = await this.supabase.query(
                            `SELECT * FROM get_wa_contact_enriched($1)`,
                            [eventData.contactId]
                        );
                        contact = contactResult.rows[0]?.get_wa_contact_enriched || null;
                    }

                    // Evaluate conditions
                    const conditionsPass = await this.evaluateConditions(automation, contact, eventData);
                    if (!conditionsPass) {
                        console.log(`❌ [AutomationEngine] Condições não atendidas para "${automation.name}"`);
                        continue;
                    }

                    // Create execution record
                    const execResult = await this.supabase.query(
                        `INSERT INTO wa_automation_executions
                         (automation_id, automation_version, contact_id, instance_id, chat_id, status, trigger_event, context)
                         VALUES ($1, $2, $3, $4, $5, 'running', $6, '{}')
                         RETURNING *`,
                        [
                            automation.id,
                            automation.version || 1,
                            eventData.contactId || null,
                            eventData.instanceId || null,
                            eventData.chatId || null,
                            JSON.stringify({ eventType, ...eventData })
                        ]
                    );
                    const execution = execResult.rows[0];

                    // Build context
                    const context = {
                        orgId,
                        instanceId: eventData.instanceId,
                        contactId: eventData.contactId,
                        chatId: eventData.chatId,
                        contact,
                        eventData,
                        executionId: execution.id,
                        depth,
                        variables: {
                            ...this.extractVariables(contact, eventData)
                        }
                    };

                    // Execute actions
                    const actions = automation.actions || [];
                    actions.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

                    await this.executeActions(execution, actions, context);

                    // Check conflict mode
                    if (automation.conflict_mode === 'stop_others') {
                        console.log(`🛑 [AutomationEngine] stop_others: parando demais automações`);
                        break;
                    }
                } catch (autoErr) {
                    console.error(`❌ [AutomationEngine] Erro na automação "${automation.name}":`, autoErr.message);
                }
            }
        } catch (err) {
            console.error(`❌ [AutomationEngine] Erro ao processar evento ${eventType}:`, err.message);
        }
    }

    // =====================================================================
    // FIND MATCHING AUTOMATIONS
    // =====================================================================
    async findMatchingAutomations(orgId, eventType, eventData) {
        let triggerType = eventType;

        // keyword_detected maps to message_received with keyword check
        if (eventType === 'keyword_detected') triggerType = 'keyword_detected';

        const result = await this.supabase.query(
            `SELECT a.*,
                (SELECT json_agg(t.*) FROM wa_automation_triggers t WHERE t.automation_id = a.id) as triggers,
                (SELECT json_agg(c.* ORDER BY c.order_index) FROM wa_automation_conditions c WHERE c.automation_id = a.id) as conditions,
                (SELECT json_agg(ac.* ORDER BY ac.order_index) FROM wa_automation_actions ac WHERE ac.automation_id = a.id) as actions
             FROM wa_automations a
             JOIN wa_automation_triggers t ON t.automation_id = a.id
             WHERE a.organization_id = $1
               AND a.is_active = true
               AND t.trigger_type = $2
             ORDER BY a.priority ASC`,
            [orgId, triggerType]
        );

        const automations = result.rows;

        // For keyword_detected, filter by keywords in trigger config
        if (eventType === 'keyword_detected' && eventData.messageText) {
            return automations.filter(auto => {
                const triggers = auto.triggers || [];
                return triggers.some(t => {
                    const keywords = t.config?.keywords || [];
                    const msgLower = eventData.messageText.toLowerCase();
                    return keywords.some(kw => msgLower.includes(kw.toLowerCase()));
                });
            });
        }

        return automations;
    }

    // =====================================================================
    // EVALUATE CONDITIONS
    // =====================================================================
    async evaluateConditions(automation, contact, eventData) {
        const conditions = automation.conditions;
        if (!conditions || conditions.length === 0) return true;

        let andResults = [];
        let orResults = [];

        for (const cond of conditions) {
            const result = await this.evaluateSingleCondition(cond, contact, eventData);
            if (cond.logic_gate === 'OR') {
                orResults.push(result);
            } else {
                andResults.push(result);
            }
        }

        const andPass = andResults.length === 0 || andResults.every(r => r);
        const orPass = orResults.length === 0 || orResults.some(r => r);

        return andPass && orPass;
    }

    async evaluateSingleCondition(condition, contact, eventData) {
        const config = condition.config || {};
        const op = condition.operator || 'eq';
        const contactData = contact?.contact || {};
        const leadData = contact?.lead || {};
        const mentoradoData = contact?.mentorado || {};
        const financeData = contact?.financeiro || {};

        try {
            switch (condition.condition_type) {
                case 'contact_has_tag': {
                    const tags = contactData.tags || [];
                    const value = config.value || config.tag;
                    return this.compareOp(tags.includes(value), true, op);
                }
                case 'contact_in_stage': {
                    return this.compareOp(contactData.pipeline_stage, config.value, op);
                }
                case 'instance_is': {
                    return this.compareOp(eventData.instanceId, config.value, op);
                }
                case 'time_window': {
                    const now = new Date();
                    const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                    const hour = brTime.getHours();
                    return hour >= (config.start_hour || 0) && hour < (config.end_hour || 24);
                }
                case 'message_contains': {
                    const msg = (eventData.messageText || '').toLowerCase();
                    const value = (config.value || '').toLowerCase();
                    if (op === 'regex') {
                        return new RegExp(config.value, 'i').test(eventData.messageText || '');
                    }
                    return msg.includes(value);
                }
                case 'contact_field_equals': {
                    const fieldValue = contactData.custom_fields?.[config.field];
                    return this.compareOp(fieldValue, config.value, op);
                }
                case 'is_lead': {
                    return leadData?.id != null;
                }
                case 'is_mentorado': {
                    return mentoradoData?.id != null;
                }
                case 'financial_status': {
                    const status = financeData?.total_atrasado > 0 ? 'atrasado'
                        : financeData?.total_pendente > 0 ? 'pendente' : 'em_dia';
                    return this.compareOp(status, config.value, op);
                }
                case 'lead_status': {
                    return this.compareOp(leadData?.status, config.value, op);
                }
                case 'has_pending_payment': {
                    const hasPending = (financeData?.dividas_pendentes || 0) > 0;
                    return config.value === 'true' ? hasPending : !hasPending;
                }
                case 'contact_replied_within': {
                    if (!eventData.contactId) return false;
                    const seconds = parseInt(config.seconds || 3600);
                    const msgCheck = await this.supabase.query(
                        `SELECT 1 FROM wa_messages
                         WHERE contact_id = $1 AND direction = 'inbound'
                         AND created_at > NOW() - INTERVAL '1 second' * $2
                         LIMIT 1`,
                        [eventData.contactId, seconds]
                    );
                    return msgCheck.rows.length > 0;
                }
                case 'custom_expression': {
                    const field = config.field;
                    const value = config.value;
                    const contextValue = eventData[field] || contactData.custom_fields?.[field];
                    return this.compareOp(contextValue, value, op);
                }
                default:
                    return true;
            }
        } catch (err) {
            console.error(`⚠️ [AutomationEngine] Erro ao avaliar condição ${condition.condition_type}:`, err.message);
            return false;
        }
    }

    compareOp(actual, expected, op) {
        switch (op) {
            case 'eq': return actual == expected;
            case 'neq': return actual != expected;
            case 'gt': return parseFloat(actual) > parseFloat(expected);
            case 'lt': return parseFloat(actual) < parseFloat(expected);
            case 'gte': return parseFloat(actual) >= parseFloat(expected);
            case 'lte': return parseFloat(actual) <= parseFloat(expected);
            case 'contains': return String(actual || '').toLowerCase().includes(String(expected || '').toLowerCase());
            case 'regex': return new RegExp(expected, 'i').test(String(actual || ''));
            case 'in': return Array.isArray(expected) ? expected.includes(actual) : String(expected).split(',').includes(String(actual));
            case 'not_in': return Array.isArray(expected) ? !expected.includes(actual) : !String(expected).split(',').includes(String(actual));
            case 'exists': return actual != null && actual !== '';
            case 'not_exists': return actual == null || actual === '';
            default: return actual == expected;
        }
    }

    // =====================================================================
    // EXECUTE ACTIONS
    // =====================================================================
    async executeActions(execution, actions, context, startIndex = 0) {
        for (let i = startIndex; i < actions.length; i++) {
            const action = actions[i];

            try {
                // Update current action index
                await this.supabase.query(
                    `UPDATE wa_automation_executions SET current_action_index = $1 WHERE id = $2`,
                    [i, execution.id]
                );

                const result = await this.executeAction(action, context);

                if (result && result.pause) {
                    // Pause execution
                    const newStatus = result.reason || 'waiting_delay';
                    const updateData = { status: newStatus, current_action_index: i + 1 };

                    if (result.resume_at) {
                        updateData.resume_at = result.resume_at;

                        // Create scheduled job for resume
                        await this.supabase.query(
                            `INSERT INTO wa_scheduled_jobs (organization_id, job_type, payload, execute_at)
                             VALUES ($1, 'automation_resume', $2, $3)`,
                            [
                                context.orgId,
                                JSON.stringify({ execution_id: execution.id, automation_id: execution.automation_id }),
                                result.resume_at
                            ]
                        );
                    }

                    await this.supabase.query(
                        `UPDATE wa_automation_executions
                         SET status = $1, current_action_index = $2, resume_at = $3, context = $4
                         WHERE id = $5`,
                        [
                            newStatus,
                            i + 1,
                            result.resume_at || null,
                            JSON.stringify(context.variables || {}),
                            execution.id
                        ]
                    );

                    console.log(`⏸️ [AutomationEngine] Execução ${execution.id} pausada: ${newStatus}`);
                    return;
                }

                // Add delay between message sends to avoid spam
                if (['send_message', 'send_template', 'send_media', 'send_notification', 'send_payment_reminder'].includes(action.action_type)) {
                    await this.delay(this.MESSAGE_DELAY_MS);
                }

            } catch (actionErr) {
                console.error(`❌ [AutomationEngine] Erro na ação ${action.action_type}:`, actionErr.message);

                await this.supabase.query(
                    `UPDATE wa_automation_executions
                     SET status = 'failed', error_message = $1, completed_at = NOW()
                     WHERE id = $2`,
                    [actionErr.message, execution.id]
                );
                return;
            }
        }

        // All actions completed
        await this.supabase.query(
            `UPDATE wa_automation_executions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [execution.id]
        );
        console.log(`✅ [AutomationEngine] Execução ${execution.id} completada`);
    }

    // =====================================================================
    // EXECUTE SINGLE ACTION
    // =====================================================================
    async executeAction(action, context) {
        const config = action.config || {};
        const actionType = action.action_type;

        console.log(`▶️ [AutomationEngine] Executando: ${actionType}`, config);

        switch (actionType) {
            case 'send_message':
                return await this.actionSendMessage(config, context);
            case 'send_template':
                return await this.actionSendTemplate(config, context);
            case 'send_media':
                return await this.actionSendMedia(config, context);
            case 'wait_delay':
                return await this.actionWaitDelay(config, context);
            case 'wait_for_reply':
                return await this.actionWaitForReply(config, context);
            case 'add_tag':
                return await this.actionAddTag(config, context);
            case 'remove_tag':
                return await this.actionRemoveTag(config, context);
            case 'change_stage':
                return await this.actionChangeStage(config, context);
            case 'assign_to_user':
                return await this.actionAssignToUser(config, context);
            case 'create_calendar_event':
                return await this.actionCreateCalendarEvent(config, context);
            case 'create_lead':
                return await this.actionCreateLead(config, context);
            case 'call_webhook':
                return await this.actionCallWebhook(config, context);
            case 'set_contact_field':
                return await this.actionSetContactField(config, context);
            case 'pause_automation':
                return { pause: true, reason: 'paused_by_human' };
            case 'transfer_to_human':
                return await this.actionTransferToHuman(config, context);
            case 'run_sub_automation':
                return await this.actionRunSubAutomation(config, context);
            case 'send_notification':
                return await this.actionSendNotification(config, context);
            case 'update_lead_status':
                return await this.actionUpdateLeadStatus(config, context);
            case 'update_financial_status':
                return await this.actionUpdateFinancialStatus(config, context);
            case 'link_to_mentorado':
                return await this.actionLinkToMentorado(config, context);
            case 'send_payment_reminder':
                return await this.actionSendPaymentReminder(config, context);
            default:
                console.log(`⚠️ [AutomationEngine] Ação desconhecida: ${actionType}`);
                return null;
        }
    }

    // =====================================================================
    // ACTION HANDLERS
    // =====================================================================

    async actionSendMessage(config, context) {
        const message = this.substituteVars(config.message || config.text || '', context);
        const targetJid = await this.resolveTargetJid(config, context);
        const session = this.getSessionForContext(config, context);

        if (!session?.sock || !session.isReady) {
            throw new Error('Sessão WhatsApp não conectada');
        }

        await session.sock.sendMessage(targetJid, { text: message });

        // Record in wa_messages
        await this.recordMessage(context, targetJid, message, 'text');

        console.log(`📤 [AutomationEngine] Mensagem enviada para ${targetJid}`);
        return null;
    }

    async actionSendTemplate(config, context) {
        const templateResult = await this.supabase.query(
            `SELECT * FROM wa_message_templates WHERE id = $1 AND is_active = true`,
            [config.template_id]
        );
        const template = templateResult.rows[0];
        if (!template) throw new Error(`Template ${config.template_id} não encontrado`);

        const message = this.substituteVars(template.body, context);
        const targetJid = await this.resolveTargetJid(config, context);
        const session = this.getSessionForContext(config, context);

        if (!session?.sock || !session.isReady) {
            throw new Error('Sessão WhatsApp não conectada');
        }

        if (template.media_url) {
            const mediaUrl = this.substituteVars(template.media_url, context);
            await session.sock.sendMessage(targetJid, {
                image: { url: mediaUrl },
                caption: message
            });
        } else {
            await session.sock.sendMessage(targetJid, { text: message });
        }

        await this.recordMessage(context, targetJid, message, template.media_url ? 'image' : 'text');
        return null;
    }

    async actionSendMedia(config, context) {
        const targetJid = await this.resolveTargetJid(config, context);
        const session = this.getSessionForContext(config, context);
        if (!session?.sock || !session.isReady) throw new Error('Sessão WhatsApp não conectada');

        const caption = this.substituteVars(config.caption || '', context);
        const mediaUrl = this.substituteVars(config.media_url || config.url || '', context);
        const mediaType = config.media_type || 'image';

        const msgContent = mediaType === 'video'
            ? { video: { url: mediaUrl }, caption }
            : mediaType === 'document'
                ? { document: { url: mediaUrl }, mimetype: config.mimetype || 'application/pdf', fileName: config.filename || 'document' }
                : { image: { url: mediaUrl }, caption };

        await session.sock.sendMessage(targetJid, msgContent);
        await this.recordMessage(context, targetJid, caption, mediaType);
        return null;
    }

    async actionWaitDelay(config) {
        const delayMs = (config.delay_seconds || config.seconds || 60) * 1000;
        const resumeAt = new Date(Date.now() + delayMs);

        return { pause: true, reason: 'waiting_delay', resume_at: resumeAt.toISOString() };
    }

    async actionWaitForReply(config, context) {
        // If timeout specified, create a timeout job
        if (config.timeout_seconds) {
            const timeoutAt = new Date(Date.now() + config.timeout_seconds * 1000);
            await this.supabase.query(
                `INSERT INTO wa_scheduled_jobs (organization_id, job_type, payload, execute_at)
                 VALUES ($1, 'automation_resume', $2, $3)`,
                [
                    context.orgId,
                    JSON.stringify({
                        execution_id: context.executionId,
                        timeout: true,
                        reason: 'reply_timeout'
                    }),
                    timeoutAt.toISOString()
                ]
            );
        }

        return { pause: true, reason: 'waiting_reply' };
    }

    async actionAddTag(config, context) {
        if (!context.contactId) return null;
        const tag = this.substituteVars(config.tag || config.value || '', context);
        await this.supabase.query(
            `UPDATE wa_contacts SET tags = array_append(tags, $1), updated_at = NOW()
             WHERE id = $2 AND NOT ($1 = ANY(tags))`,
            [tag, context.contactId]
        );
        await this.recordHistory(context, 'tag_added', `Tag adicionada: ${tag}`);
        return null;
    }

    async actionRemoveTag(config, context) {
        if (!context.contactId) return null;
        const tag = this.substituteVars(config.tag || config.value || '', context);
        await this.supabase.query(
            `UPDATE wa_contacts SET tags = array_remove(tags, $1), updated_at = NOW() WHERE id = $2`,
            [tag, context.contactId]
        );
        await this.recordHistory(context, 'tag_removed', `Tag removida: ${tag}`);
        return null;
    }

    async actionChangeStage(config, context) {
        if (!context.contactId) return null;
        const stage = config.stage || config.value;
        await this.supabase.query(
            `UPDATE wa_contacts SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2`,
            [stage, context.contactId]
        );
        if (context.chatId) {
            await this.supabase.query(
                `UPDATE wa_chats SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2`,
                [stage, context.chatId]
            );
        }
        await this.recordHistory(context, 'stage_changed', `Estágio alterado para: ${stage}`);
        return null;
    }

    async actionAssignToUser(config, context) {
        if (!context.chatId) return null;
        await this.supabase.query(
            `UPDATE wa_chats SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
            [config.user_id, context.chatId]
        );
        return null;
    }

    async actionCreateCalendarEvent(config, context) {
        const title = this.substituteVars(config.title || 'Evento automático', context);
        const description = this.substituteVars(config.description || '', context);
        await this.supabase.query(
            `INSERT INTO calendar_events (organization_id, title, description, start_date, end_date, type, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'automation')`,
            [
                context.orgId, title, description,
                config.start_date || new Date().toISOString(),
                config.end_date || new Date(Date.now() + 3600000).toISOString(),
                config.event_type || 'geral'
            ]
        );
        return null;
    }

    async actionCreateLead(config, context) {
        const contact = context.contact?.contact || {};
        const leadResult = await this.supabase.query(
            `INSERT INTO leads (organization_id, nome_completo, telefone, email, origem, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'novo', NOW())
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
                context.orgId,
                this.substituteVars(config.nome || '{{contact.name}}', context),
                contact.phone_number || '',
                this.substituteVars(config.email || '', context),
                config.origem || 'whatsapp_automation'
            ]
        );
        if (leadResult.rows[0]) {
            await this.supabase.query(
                `UPDATE wa_contacts SET lead_id = $1, updated_at = NOW() WHERE id = $2`,
                [leadResult.rows[0].id, context.contactId]
            );
            context.variables['lead.id'] = leadResult.rows[0].id;
        }
        return null;
    }

    async actionCallWebhook(config, context) {
        const url = this.substituteVars(config.url, context);
        const method = (config.method || 'POST').toUpperCase();
        const headers = config.headers || { 'Content-Type': 'application/json' };
        const body = config.body ? JSON.parse(this.substituteVars(JSON.stringify(config.body), context)) : {
            event: context.eventData,
            contact: context.contact,
            variables: context.variables
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: method !== 'GET' ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            clearTimeout(timeout);

            const responseData = await response.text();
            context.variables['webhook_response'] = responseData;
            try { context.variables['webhook_json'] = JSON.parse(responseData); } catch {}
        } catch (err) {
            clearTimeout(timeout);
            console.error(`⚠️ [AutomationEngine] Webhook falhou: ${err.message}`);
            if (config.fail_on_error) throw err;
        }
        return null;
    }

    async actionSetContactField(config, context) {
        if (!context.contactId) return null;
        const field = config.field;
        const value = this.substituteVars(config.value || '', context);
        await this.supabase.query(
            `UPDATE wa_contacts SET custom_fields = custom_fields || $1::jsonb, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify({ [field]: value }), context.contactId]
        );
        return null;
    }

    async actionTransferToHuman(config, context) {
        if (context.chatId) {
            await this.supabase.query(
                `UPDATE wa_chats SET is_automation_paused = true, assigned_to = $1, updated_at = NOW() WHERE id = $2`,
                [config.user_id || null, context.chatId]
            );
        }
        // Cancel all active executions for this contact
        if (context.contactId) {
            await this.supabase.query(
                `UPDATE wa_automation_executions SET status = 'cancelled', completed_at = NOW()
                 WHERE contact_id = $1 AND status IN ('running', 'waiting_delay', 'waiting_reply')
                 AND id != $2`,
                [context.contactId, context.executionId]
            );
        }
        return null;
    }

    async actionRunSubAutomation(config, context) {
        if ((context.depth || 0) >= this.MAX_RECURSION_DEPTH - 1) {
            console.log(`⚠️ [AutomationEngine] Sub-automação ignorada (profundidade máxima)`);
            return null;
        }
        await this.handleEvent(
            context.orgId,
            config.event_type || 'message_received',
            { ...context.eventData, ...config.event_data },
            (context.depth || 0) + 1
        );
        return null;
    }

    async actionSendNotification(config, context) {
        const message = this.substituteVars(config.message || 'Notificação de automação', context);

        // Get admin phone or specified notification target
        let targetPhone = config.notify_phone;
        if (!targetPhone) {
            const orgResult = await this.supabase.query(
                `SELECT admin_phone FROM organizations WHERE id = $1`,
                [context.orgId]
            );
            targetPhone = orgResult.rows[0]?.admin_phone;
        }

        if (!targetPhone) return null;

        const session = this.getSessionForContext(config, context);
        if (!session?.sock || !session.isReady) return null;

        const jid = targetPhone.includes('@') ? targetPhone : `${targetPhone.replace(/\D/g, '')}@s.whatsapp.net`;
        await session.sock.sendMessage(jid, { text: `🤖 *Automação*\n\n${message}` });
        return null;
    }

    async actionUpdateLeadStatus(config, context) {
        const leadId = context.contact?.lead?.id;
        if (!leadId) return null;
        await this.supabase.query(
            `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
            [config.status || config.value, leadId]
        );
        return null;
    }

    async actionUpdateFinancialStatus(config, context) {
        if (!context.contactId) return null;
        await this.supabase.query(
            `UPDATE wa_chats SET financial_status = $1, updated_at = NOW()
             WHERE contact_id = $2`,
            [config.status || config.value, context.contactId]
        );
        return null;
    }

    async actionLinkToMentorado(config, context) {
        if (!context.contactId) return null;

        let mentoradoId = config.mentorado_id;

        // Try to find by phone if no explicit ID
        if (!mentoradoId && context.contact?.contact?.phone_number) {
            const phone = context.contact.contact.phone_number;
            const last9 = phone.slice(-9);
            const mentoradoResult = await this.supabase.query(
                `SELECT id FROM mentorados WHERE organization_id = $1 AND telefone LIKE '%' || $2 LIMIT 1`,
                [context.orgId, last9]
            );
            mentoradoId = mentoradoResult.rows[0]?.id;
        }

        if (mentoradoId) {
            await this.supabase.query(
                `UPDATE wa_contacts SET mentorado_id = $1, updated_at = NOW() WHERE id = $2`,
                [mentoradoId, context.contactId]
            );
            await this.recordHistory(context, 'linked_to_mentorado', `Vinculado ao mentorado ${mentoradoId}`);
        }
        return null;
    }

    async actionSendPaymentReminder(config, context) {
        const mentoradoId = context.contact?.mentorado?.id;
        if (!mentoradoId) return null;

        const dividasResult = await this.supabase.query(
            `SELECT * FROM dividas WHERE mentorado_id = $1 AND status IN ('pendente', 'atrasado') ORDER BY data_vencimento LIMIT 5`,
            [mentoradoId]
        );

        if (dividasResult.rows.length === 0) return null;

        const dividas = dividasResult.rows;
        const totalPendente = dividas.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0);
        const nome = context.contact?.mentorado?.nome || context.contact?.contact?.display_name || 'Cliente';

        let message = config.message || `Olá ${nome}! 💰\n\nVocê possui ${dividas.length} parcela(s) pendente(s) no valor total de R$ ${totalPendente.toFixed(2)}.\n\n`;

        dividas.forEach((d, i) => {
            const vencimento = new Date(d.data_vencimento).toLocaleDateString('pt-BR');
            message += `📌 Parcela ${i + 1}: R$ ${parseFloat(d.valor).toFixed(2)} - Venc: ${vencimento}\n`;
        });

        message += '\nPor favor, regularize suas pendências. Qualquer dúvida estamos à disposição!';

        const targetJid = await this.resolveTargetJid(config, context);
        const session = this.getSessionForContext(config, context);
        if (!session?.sock || !session.isReady) throw new Error('Sessão WhatsApp não conectada');

        await session.sock.sendMessage(targetJid, { text: message });
        await this.recordMessage(context, targetJid, message, 'text');
        return null;
    }

    // =====================================================================
    // RESUME EXECUTION (for delayed/waiting automations)
    // =====================================================================
    async resumeExecution(executionId, replyData = null) {
        try {
            const execResult = await this.supabase.query(
                `SELECT * FROM wa_automation_executions WHERE id = $1`,
                [executionId]
            );
            const execution = execResult.rows[0];
            if (!execution) return;

            if (!['waiting_delay', 'waiting_reply'].includes(execution.status)) {
                console.log(`⚠️ [AutomationEngine] Execução ${executionId} não está pausada (status: ${execution.status})`);
                return;
            }

            // Get automation with actions
            const autoResult = await this.supabase.query(
                `SELECT a.*,
                    (SELECT json_agg(ac.* ORDER BY ac.order_index) FROM wa_automation_actions ac WHERE ac.automation_id = a.id) as actions
                 FROM wa_automations a WHERE a.id = $1`,
                [execution.automation_id]
            );
            const automation = autoResult.rows[0];
            if (!automation) return;

            // Get contact
            let contact = null;
            if (execution.contact_id) {
                const contactResult = await this.supabase.query(
                    `SELECT * FROM get_wa_contact_enriched($1)`,
                    [execution.contact_id]
                );
                contact = contactResult.rows[0]?.get_wa_contact_enriched || null;
            }

            // Get org from automation
            const orgId = automation.organization_id;

            // Build context
            const savedVars = execution.context || {};
            const context = {
                orgId,
                instanceId: execution.instance_id,
                contactId: execution.contact_id,
                chatId: execution.chat_id,
                contact,
                eventData: execution.trigger_event || {},
                executionId: execution.id,
                depth: 0,
                variables: {
                    ...this.extractVariables(contact, execution.trigger_event || {}),
                    ...savedVars,
                    ...(replyData ? { reply_text: replyData.messageText, reply: replyData } : {})
                }
            };

            // Update status to running
            await this.supabase.query(
                `UPDATE wa_automation_executions SET status = 'running', resume_at = NULL WHERE id = $1`,
                [executionId]
            );

            // Continue from where we left off
            const actions = automation.actions || [];
            actions.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
            const startIndex = execution.current_action_index || 0;

            await this.executeActions(execution, actions, context, startIndex);

        } catch (err) {
            console.error(`❌ [AutomationEngine] Erro ao retomar execução ${executionId}:`, err.message);
            await this.supabase.query(
                `UPDATE wa_automation_executions SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
                [err.message, executionId]
            );
        }
    }

    // =====================================================================
    // HANDLE INCOMING REPLY (resumes waiting_reply executions)
    // =====================================================================
    async handleIncomingReply(orgId, contactId, messageText) {
        if (!contactId) return;

        try {
            const execResult = await this.supabase.query(
                `SELECT id FROM wa_automation_executions
                 WHERE contact_id = $1 AND status = 'waiting_reply'
                 ORDER BY started_at DESC`,
                [contactId]
            );

            for (const exec of execResult.rows) {
                await this.resumeExecution(exec.id, { messageText });
            }
        } catch (err) {
            console.error(`⚠️ [AutomationEngine] Erro ao processar reply:`, err.message);
        }
    }

    // =====================================================================
    // PROCESS SCHEDULED JOBS (called by cron)
    // =====================================================================
    async processScheduledJobs() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Atomically claim pending jobs
            const jobsResult = await this.supabase.query(
                `UPDATE wa_scheduled_jobs
                 SET status = 'processing', attempts = attempts + 1
                 WHERE id IN (
                    SELECT id FROM wa_scheduled_jobs
                    WHERE status = 'pending' AND execute_at <= NOW()
                    ORDER BY execute_at ASC
                    LIMIT 20
                 )
                 RETURNING *`
            );

            const jobs = jobsResult.rows;
            if (jobs.length === 0) {
                this.isProcessing = false;
                return;
            }

            console.log(`⚙️ [AutomationEngine] Processando ${jobs.length} job(s) agendado(s)`);

            for (const job of jobs) {
                try {
                    const payload = job.payload || {};

                    switch (job.job_type) {
                        case 'automation_resume':
                            if (payload.timeout && payload.reason === 'reply_timeout') {
                                // Check if still waiting
                                const execCheck = await this.supabase.query(
                                    `SELECT status FROM wa_automation_executions WHERE id = $1`,
                                    [payload.execution_id]
                                );
                                if (execCheck.rows[0]?.status === 'waiting_reply') {
                                    // Timed out - resume with timeout flag
                                    await this.resumeExecution(payload.execution_id, { messageText: '', timedOut: true });
                                }
                            } else {
                                await this.resumeExecution(payload.execution_id);
                            }
                            break;

                        case 'send_scheduled': {
                            const session = this.getSessionFunc(payload.session_id || payload.instance_id);
                            if (session?.sock && session.isReady) {
                                const jid = payload.jid || `${payload.phone?.replace(/\D/g, '')}@s.whatsapp.net`;
                                await session.sock.sendMessage(jid, { text: payload.message });
                            }
                            break;
                        }

                        case 'cron_trigger':
                            await this.handleEvent(payload.org_id || job.organization_id, 'schedule_cron', payload);
                            break;

                        case 'payment_reminder':
                            await this.handleEvent(
                                job.organization_id,
                                'payment_overdue',
                                { contactId: payload.contact_id, mentoradoId: payload.mentorado_id }
                            );
                            break;

                        case 'followup':
                            // Delegate to existing follow-up system (handled externally)
                            break;

                        default:
                            console.log(`⚠️ [AutomationEngine] Tipo de job desconhecido: ${job.job_type}`);
                    }

                    // Mark completed
                    await this.supabase.query(
                        `UPDATE wa_scheduled_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                        [job.id]
                    );

                } catch (jobErr) {
                    console.error(`❌ [AutomationEngine] Erro no job ${job.id}:`, jobErr.message);

                    if (job.attempts >= job.max_attempts) {
                        await this.supabase.query(
                            `UPDATE wa_scheduled_jobs SET status = 'failed', last_error = $1 WHERE id = $2`,
                            [jobErr.message, job.id]
                        );
                    } else {
                        // Back to pending for retry
                        await this.supabase.query(
                            `UPDATE wa_scheduled_jobs SET status = 'pending', last_error = $1 WHERE id = $2`,
                            [jobErr.message, job.id]
                        );
                    }
                }
            }
        } catch (err) {
            console.error(`❌ [AutomationEngine] Erro no processamento de jobs:`, err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    // =====================================================================
    // VARIABLE SUBSTITUTION
    // =====================================================================
    substituteVars(template, context) {
        if (!template) return '';

        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
            const value = this.resolveVarPath(path, context);
            return value != null ? String(value) : '';
        });
    }

    resolveVarPath(path, context) {
        const vars = context.variables || {};

        // Direct variable lookup
        if (vars[path] != null) return vars[path];

        // Nested path resolution
        const parts = path.split('.');
        const root = parts[0];
        const rest = parts.slice(1).join('.');

        const sources = {
            'contact': context.contact?.contact || {},
            'lead': context.contact?.lead || {},
            'mentorado': context.contact?.mentorado || {},
            'financeiro': context.contact?.financeiro || {},
            'event': context.eventData || {},
            'var': vars
        };

        if (sources[root] && rest) {
            return sources[root][rest];
        }

        // Shortcuts
        const shortcuts = {
            'nome': context.contact?.contact?.display_name || context.contact?.lead?.nome || '',
            'telefone': context.contact?.contact?.phone_number || '',
            'email': context.contact?.lead?.email || context.contact?.mentorado?.email || ''
        };

        return shortcuts[path] || vars[path] || null;
    }

    extractVariables(contact, eventData) {
        const vars = {};
        if (contact) {
            const c = contact.contact || {};
            const l = contact.lead || {};
            const m = contact.mentorado || {};
            const f = contact.financeiro || {};

            vars['contact.name'] = c.display_name || '';
            vars['contact.phone'] = c.phone_number || '';
            vars['contact.stage'] = c.pipeline_stage || '';
            vars['lead.nome'] = l.nome || '';
            vars['lead.email'] = l.email || '';
            vars['lead.status'] = l.status || '';
            vars['lead.temperatura'] = l.temperatura || '';
            vars['lead.valor_vendido'] = l.valor_vendido || '0';
            vars['mentorado.nome'] = m.nome || '';
            vars['mentorado.email'] = m.email || '';
            vars['mentorado.turma'] = m.turma || '';
            vars['mentorado.status'] = m.status || '';
            vars['financeiro.total_pendente'] = f.total_pendente || '0';
            vars['financeiro.total_atrasado'] = f.total_atrasado || '0';
            vars['financeiro.dividas_pendentes'] = f.dividas_pendentes || '0';
        }
        if (eventData) {
            vars['event.type'] = eventData.eventType || '';
            vars['event.message'] = eventData.messageText || '';
        }
        return vars;
    }

    // =====================================================================
    // HELPERS
    // =====================================================================

    async resolveTargetJid(config, context) {
        // If explicit target phone in config
        if (config.target_phone || config.to) {
            const phone = this.substituteVars(config.target_phone || config.to, context);
            const clean = phone.replace(/\D/g, '');
            return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
        }

        // Use contact's primary JID
        if (context.contactId) {
            const identResult = await this.supabase.query(
                `SELECT jid FROM contact_identifiers
                 WHERE contact_id = $1 AND jid_type = 'pn' AND is_primary = true
                 LIMIT 1`,
                [context.contactId]
            );
            if (identResult.rows[0]) return identResult.rows[0].jid;

            // Fallback: any PN identifier
            const anyPn = await this.supabase.query(
                `SELECT jid FROM contact_identifiers
                 WHERE contact_id = $1 AND jid_type = 'pn'
                 LIMIT 1`,
                [context.contactId]
            );
            if (anyPn.rows[0]) return anyPn.rows[0].jid;
        }

        // Fallback: use chatId from event
        if (context.chatId) return context.chatId;
        if (context.eventData?.senderJid) return context.eventData.senderJid;

        throw new Error('Não foi possível determinar o destinatário');
    }

    getSessionForContext(config, context) {
        // If specific instance requested
        const instanceId = config.instance_id || config.session_id || context.instanceId;
        if (instanceId) {
            const session = this.getSessionFunc(instanceId);
            if (session?.sock && session.isReady) return session;
        }

        // Try org-based session
        if (context.orgId) {
            const session = this.getSessionFunc(context.orgId);
            if (session?.sock && session.isReady) return session;
        }

        // Try any connected session
        // (getSessionFunc might be userSessions.get which only takes exact key)
        return null;
    }

    async recordMessage(context, targetJid, body, contentType) {
        try {
            if (!context.chatId) return;
            await this.supabase.query(
                `INSERT INTO wa_messages (chat_id, contact_id, instance_id, direction, content_type, body, sent_by_automation_id, status)
                 VALUES ($1, $2, $3, 'outbound', $4, $5, $6, 'sent')`,
                [
                    context.chatId,
                    context.contactId,
                    context.instanceId,
                    contentType,
                    body,
                    context.executionId
                ]
            );
        } catch (err) {
            // Non-critical, just log
            console.log(`⚠️ [AutomationEngine] Erro ao registrar mensagem:`, err.message);
        }
    }

    async recordHistory(context, action, description) {
        try {
            if (!context.contactId) return;
            await this.supabase.query(
                `INSERT INTO wa_contact_history (contact_id, organization_id, action, description, actor_type, actor_id)
                 VALUES ($1, $2, $3, $4, 'automation', $5)`,
                [context.contactId, context.orgId, action, description, context.executionId]
            );
        } catch (err) {
            console.log(`⚠️ [AutomationEngine] Erro ao registrar histórico:`, err.message);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get orgId from a session userId (cached)
    async getOrgIdForSession(userId) {
        if (this.orgCache.has(userId)) return this.orgCache.get(userId);

        try {
            // Try direct org lookup
            const orgResult = await this.supabase.query(
                `SELECT organization_id FROM whatsapp_instances WHERE session_path LIKE '%' || $1 LIMIT 1`,
                [userId]
            );
            if (orgResult.rows[0]) {
                this.orgCache.set(userId, orgResult.rows[0].organization_id);
                return orgResult.rows[0].organization_id;
            }

            // Try as org ID directly
            const directOrg = await this.supabase.query(
                `SELECT id FROM organizations WHERE id = $1 LIMIT 1`,
                [userId]
            );
            if (directOrg.rows[0]) {
                this.orgCache.set(userId, userId);
                return userId;
            }
        } catch (err) {
            console.log(`⚠️ [AutomationEngine] Erro ao resolver orgId para ${userId}:`, err.message);
        }

        return userId; // Fallback: assume userId is orgId
    }
}

module.exports = { AutomationEngine };
