/**
 * db.js - PostgreSQL query builder that mimics @supabase/supabase-js API
 * Drop-in replacement: just change `const supabase = createClient(...)` to `const supabase = require('./db')`
 * All existing `.from().select().eq()...` chains work without code changes.
 */

const { Pool } = require('pg');

// =====================================================================
// Connection Pool
// =====================================================================

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'cssystem',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'cssystem_db_2026',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('💥 [DB] Pool error:', err.message);
});

// =====================================================================
// Foreign Key Mappings (table → related table FK resolution)
// =====================================================================

const FK_MAP = {
    follow_ups: {
        leads: { fk: 'lead_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    calendar_events: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
        closers: { fk: 'closer_id', pk: 'id' },
    },
    dividas: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    lead_followup_executions: {
        leads: { fk: 'lead_id', pk: 'id' },
        lead_followup_sequences: { fk: 'sequence_id', pk: 'id' },
    },
    lead_followups: {
        leads: { fk: 'lead_id', pk: 'id' },
    },
    auto_message_logs: {
        auto_messages: { fk: 'auto_message_id', pk: 'id' },
    },
    organizations: {},
    leads: {
        organizations: { fk: 'organization_id', pk: 'id' },
        closers: { fk: 'closer_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    lid_phone_mappings: {},
    auto_messages: {},
    instagram_messages: {},
    profiles: { organizations: { fk: 'organization_id', pk: 'id' } },
    mentorados: { organizations: { fk: 'organization_id', pk: 'id' } },
    comissoes: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
    },
    commissions: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    closers: {
        organizations: { fk: 'organization_id', pk: 'id' },
        closer_levels: { fk: 'closer_level_id', pk: 'id' },
    },
    closers_vendas: {
        closers: { fk: 'closer_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    closers_atividades: {
        closers: { fk: 'closer_id', pk: 'id' },
    },
    form_submissions: {
        form_templates: { fk: 'form_id', pk: 'id' },
    },
    formularios_respostas: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    organization_users: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    kanban_tasks: {
        kanban_columns: { fk: 'column_id', pk: 'id' },
    },
    kanban_columns: {
        kanban_boards: { fk: 'board_id', pk: 'id' },
    },
    video_lessons: {
        video_modules: { fk: 'module_id', pk: 'id' },
    },
    lesson_progress: {
        video_lessons: { fk: 'lesson_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    video_access_control: {
        video_modules: { fk: 'module_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    referrals: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    referral_payments: {
        referrals: { fk: 'referral_id', pk: 'id' },
    },
    despesas_mensais: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    historico_pagamentos: {
        dividas: { fk: 'divida_id', pk: 'id' },
    },
    notification_logs: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    whatsapp_messages: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    agendamentos: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    pontuacao_mentorados: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    checkins: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    metas: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    contracts: {
        organizations: { fk: 'organization_id', pk: 'id' },
        contract_templates: { fk: 'template_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    instagram_automations: {},
    instagram_funnels: {},
    instagram_funnel_steps: {
        instagram_funnels: { fk: 'funnel_id', pk: 'id' },
    },
    scoring_configurations: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    lead_followup_sequences: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    faturamento: {
        leads: { fk: 'lead_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    closer_levels: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    closer_level_assignments: {
        closers: { fk: 'closer_id', pk: 'id' },
        closer_levels: { fk: 'level_id', pk: 'id' },
    },
    icp_form_templates: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    icp_responses: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        icp_form_templates: { fk: 'template_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    transacoes_financeiras: {
        organizations: { fk: 'organization_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    usuarios_financeiro: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    group_events: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    group_event_participants: {
        group_events: { fk: 'event_id', pk: 'id' },
        leads: { fk: 'lead_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    contract_templates: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    contract_audit_log: {
        contracts: { fk: 'contract_id', pk: 'id' },
    },
    kanban_boards: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    video_modules: {
        organizations: { fk: 'organization_id', pk: 'id' },
        module_categories: { fk: 'category_id', pk: 'id' },
    },
    continue_watching: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        video_lessons: { fk: 'lesson_id', pk: 'id' },
    },
    notification_settings: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    closer_availability: {
        closers: { fk: 'closer_id', pk: 'id' },
    },
    closer_schedule_config: {
        closers: { fk: 'closer_id', pk: 'id' },
    },
    closer_study_materials: {
        organizations: { fk: 'organization_id', pk: 'id' },
        closer_material_categories: { fk: 'category_id', pk: 'id' },
    },
    closer_material_progress: {
        closers: { fk: 'closer_id', pk: 'id' },
        closer_study_materials: { fk: 'material_id', pk: 'id' },
    },
    sdrs: {
        organizations: { fk: 'organization_id', pk: 'id' },
        profiles: { fk: 'profile_id', pk: 'id' },
    },
    social_sellers: {
        organizations: { fk: 'organization_id', pk: 'id' },
        profiles: { fk: 'profile_id', pk: 'id' },
    },
    closers_metas: {
        closers: { fk: 'closer_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    lead_notes: {
        leads: { fk: 'lead_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    lead_historico: {
        leads: { fk: 'lead_id', pk: 'id' },
    },
    lead_history: {
        leads: { fk: 'lead_id', pk: 'id' },
    },
    lead_qualification_details: {
        leads: { fk: 'lead_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    video_progress: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        video_lessons: { fk: 'lesson_id', pk: 'id' },
    },
    video_access_control: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        video_modules: { fk: 'module_id', pk: 'id' },
    },
    mentorado_info: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    mentorado_atividades: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    categorias_financeiras: {
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    // Comunidade/Feed
    community_posts: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
        organizations: { fk: 'organization_id', pk: 'id' },
    },
    community_reactions: {
        community_posts: { fk: 'post_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    community_comments: {
        community_posts: { fk: 'post_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
    // Airbnb Chat
    clinica_mensagens: {
        clinicas: { fk: 'clinica_id', pk: 'id' },
        mentorados: { fk: 'remetente_id', pk: 'id' },
    },
    // Evento Lista de Espera
    evento_lista_espera: {
        group_events: { fk: 'event_id', pk: 'id' },
        mentorados: { fk: 'mentorado_id', pk: 'id' },
    },
};

// =====================================================================
// Select Parser - Handles PostgREST-style relational selects
// =====================================================================

function parseSelect(selectStr, mainTable) {
    if (!selectStr || selectStr.trim() === '*') {
        return { columns: [`"${mainTable}".*`], joins: [], nestKeys: [] };
    }

    const columns = [];
    const joins = [];
    const nestKeys = [];

    // Parse the select string, handling nested parentheses
    const parts = splitSelectParts(selectStr);

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Check for relational pattern: table(fields) or alias:table(fields) or table!inner(fields)
        const relMatch = trimmed.match(/^(\w+:)?(\w+?)(!inner)?\s*\(\s*([\s\S]*?)\s*\)$/);

        if (relMatch) {
            const alias = relMatch[1] ? relMatch[1].slice(0, -1) : null; // remove trailing ':'
            const relTable = relMatch[2];
            const isInner = !!relMatch[3];
            const relFields = relMatch[4];
            const nestKey = alias || relTable;

            // Get FK mapping
            const fkInfo = (FK_MAP[mainTable] || {})[relTable];
            if (!fkInfo) {
                console.warn(`⚠️ [DB] No FK mapping for ${mainTable} → ${relTable}`);
                continue;
            }

            const joinType = isInner ? 'INNER JOIN' : 'LEFT JOIN';
            const tableAlias = `_${nestKey}`;
            joins.push(`${joinType} "${relTable}" "${tableAlias}" ON "${tableAlias}"."${fkInfo.pk}" = "${mainTable}"."${fkInfo.fk}"`);

            // Parse relation fields
            if (relFields.trim() === '*') {
                columns.push(`row_to_json("${tableAlias}".*) AS "${nestKey}"`);
                // We'll use a subselect approach instead
                columns.pop();
                columns.push(`(SELECT row_to_json(t) FROM (SELECT "${tableAlias}".*) t) AS "${nestKey}"`);
            } else {
                const fieldList = relFields.split(',').map(f => f.trim()).filter(Boolean);
                // Build a JSON object from the fields
                const jsonParts = fieldList.map(f => `'${f}', "${tableAlias}"."${f}"`).join(', ');
                columns.push(`json_build_object(${jsonParts}) AS "${nestKey}"`);
            }

            nestKeys.push(nestKey);
        } else if (trimmed === '*') {
            columns.push(`"${mainTable}".*`);
        } else {
            // Simple column
            columns.push(`"${mainTable}"."${trimmed}"`);
        }
    }

    if (columns.length === 0) {
        columns.push(`"${mainTable}".*`);
    }

    return { columns, joins, nestKeys };
}

function splitSelectParts(selectStr) {
    const parts = [];
    let current = '';
    let depth = 0;

    for (const ch of selectStr) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current);
    return parts;
}

// =====================================================================
// Null-cleaner for JSON join results
// =====================================================================

function cleanNullJoins(row, nestKeys) {
    if (!nestKeys || nestKeys.length === 0) return row;
    for (const key of nestKeys) {
        if (row[key] && typeof row[key] === 'object') {
            const vals = Object.values(row[key]);
            if (vals.every(v => v === null)) {
                row[key] = null;
            }
        }
    }
    return row;
}

// =====================================================================
// Query Builder
// =====================================================================

class QueryBuilder {
    constructor(table) {
        this._table = table;
        this._selectStr = '*';
        this._wheres = [];
        this._values = [];
        this._orderBy = [];
        this._limitVal = null;
        this._offsetVal = null;
        this._singleRow = false;
        this._maybeSingleRow = false;
        this._operation = 'select'; // select, insert, update, delete, upsert
        this._insertData = null;
        this._updateData = null;
        this._upsertConflict = null;
        this._returnData = false;
        this._countMode = false;
        this._headOnly = false;
    }

    // --- Select ---
    select(cols, options) {
        if (cols !== undefined) this._selectStr = cols;
        if (options?.count === 'exact') this._countMode = true;
        if (options?.head) this._headOnly = true;
        this._returnData = true;
        return this;
    }

    // --- Insert ---
    insert(data) {
        this._operation = 'insert';
        this._insertData = Array.isArray(data) ? data : [data];
        return this;
    }

    // --- Update ---
    update(data) {
        this._operation = 'update';
        this._updateData = data;
        return this;
    }

    // --- Delete ---
    delete() {
        this._operation = 'delete';
        return this;
    }

    // --- Upsert ---
    upsert(data, opts) {
        this._operation = 'upsert';
        this._insertData = Array.isArray(data) ? data : [data];
        this._upsertConflict = opts?.onConflict || null;
        return this;
    }

    // --- Filters ---
    eq(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" = $${this._values.length}`);
        return this;
    }

    neq(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" != $${this._values.length}`);
        return this;
    }

    gt(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" > $${this._values.length}`);
        return this;
    }

    gte(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" >= $${this._values.length}`);
        return this;
    }

    lt(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" < $${this._values.length}`);
        return this;
    }

    lte(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" <= $${this._values.length}`);
        return this;
    }

    in(col, vals) {
        if (!vals || vals.length === 0) {
            this._wheres.push('FALSE');
            return this;
        }
        const placeholders = vals.map(v => {
            this._values.push(v);
            return `$${this._values.length}`;
        });
        this._wheres.push(`"${this._resolveCol(col)}" IN (${placeholders.join(', ')})`);
        return this;
    }

    is(col, val) {
        if (val === null) {
            this._wheres.push(`"${this._resolveCol(col)}" IS NULL`);
        } else {
            this._values.push(val);
            this._wheres.push(`"${this._resolveCol(col)}" IS $${this._values.length}`);
        }
        return this;
    }

    ilike(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" ILIKE $${this._values.length}`);
        return this;
    }

    like(col, val) {
        this._values.push(val);
        this._wheres.push(`"${this._resolveCol(col)}" LIKE $${this._values.length}`);
        return this;
    }

    not(col, op, val) {
        if (op === 'is' && val === null) {
            this._wheres.push(`"${this._resolveCol(col)}" IS NOT NULL`);
        } else if (op === 'in' && Array.isArray(val)) {
            if (val.length === 0) return this;
            const placeholders = val.map(v => {
                this._values.push(v);
                return `$${this._values.length}`;
            });
            this._wheres.push(`"${this._resolveCol(col)}" NOT IN (${placeholders.join(', ')})`);
        } else if (op === 'eq') {
            this._values.push(val);
            this._wheres.push(`"${this._resolveCol(col)}" != $${this._values.length}`);
        } else {
            this._values.push(val);
            this._wheres.push(`NOT "${this._resolveCol(col)}" = $${this._values.length}`);
        }
        return this;
    }

    or(conditionStr) {
        // Parse PostgREST-style OR: "col.op.val,col.op.val"
        const conditions = splitOrConditions(conditionStr);
        const orParts = [];

        for (const cond of conditions) {
            const parsed = parseCondition(cond.trim(), this._values, this._table);
            if (parsed) {
                this._values = parsed.values;
                orParts.push(parsed.sql);
            }
        }

        if (orParts.length > 0) {
            this._wheres.push(`(${orParts.join(' OR ')})`);
        }
        return this;
    }

    // --- Modifiers ---
    order(col, opts) {
        const dir = opts?.ascending === false ? 'DESC' : 'ASC';
        this._orderBy.push(`"${this._table}"."${col}" ${dir}`);
        return this;
    }

    limit(n) {
        this._limitVal = n;
        return this;
    }

    range(from, to) {
        this._offsetVal = from;
        this._limitVal = to - from + 1;
        return this;
    }

    single() {
        this._singleRow = true;
        this._limitVal = 1;
        return this;
    }

    maybeSingle() {
        this._singleRow = true;
        this._maybeSingleRow = true;
        this._limitVal = 1;
        return this;
    }

    // --- Column Resolution (handles "table.column" from eq filters on joins) ---
    _resolveCol(col) {
        if (col.includes('.')) {
            // e.g. "mentorados.organization_id" → join table alias
            const [tbl, field] = col.split('.');
            return `_${tbl}"."${field}`;
        }
        return `${this._table}"."${col}`;
    }

    // --- Build & Execute ---
    async _execute() {
        try {
            let sql, values;

            switch (this._operation) {
                case 'select':
                    ({ sql, values } = this._buildSelect());
                    break;
                case 'insert':
                    ({ sql, values } = this._buildInsert());
                    break;
                case 'update':
                    ({ sql, values } = this._buildUpdate());
                    break;
                case 'delete':
                    ({ sql, values } = this._buildDelete());
                    break;
                case 'upsert':
                    ({ sql, values } = this._buildUpsert());
                    break;
                default:
                    return { data: null, error: new Error(`Unknown operation: ${this._operation}`) };
            }

            const result = await pool.query(sql, values);

            let data = result.rows;
            let count = null;
            const { nestKeys } = this._operation === 'select'
                ? parseSelect(this._selectStr, this._table)
                : { nestKeys: [] };

            // Extract count from window function
            if (this._countMode && data.length > 0) {
                count = parseInt(data[0].__total_count || '0', 10);
                data = data.map(({ __total_count, ...rest }) => rest);
            } else if (this._countMode) {
                count = 0;
            }

            // Head-only mode: return count without data
            if (this._headOnly) {
                return { data: null, error: null, count };
            }

            // Clean null joins
            if (nestKeys.length > 0) {
                data = data.map(row => cleanNullJoins(row, nestKeys));
            }

            if (this._singleRow) {
                if (data.length === 0) {
                    data = null;
                    if (!this._maybeSingleRow) {
                        return { data: null, error: { code: 'PGRST116', message: 'No rows found' }, count };
                    }
                } else {
                    data = data[0];
                }
            }

            return { data, error: null, count };
        } catch (err) {
            console.error(`❌ [DB] Error in ${this._operation} on "${this._table}":`, err.message);
            return { data: null, error: err, count: null };
        }
    }

    _buildSelect() {
        const { columns, joins } = parseSelect(this._selectStr, this._table);

        // Add COUNT(*) OVER() for exact count mode
        const colList = this._countMode
            ? [...columns, 'COUNT(*) OVER() AS __total_count']
            : columns;

        let sql = `SELECT ${colList.join(', ')} FROM "${this._table}"`;

        if (joins.length > 0) {
            sql += ' ' + joins.join(' ');
        }

        if (this._wheres.length > 0) {
            sql += ` WHERE ${this._wheres.join(' AND ')}`;
        }

        if (this._orderBy.length > 0) {
            sql += ` ORDER BY ${this._orderBy.join(', ')}`;
        }

        if (this._limitVal !== null) {
            sql += ` LIMIT ${this._limitVal}`;
        }

        if (this._offsetVal !== null) {
            sql += ` OFFSET ${this._offsetVal}`;
        }

        return { sql, values: this._values };
    }

    // Serialize values for PostgreSQL
    _prepareValue(val) {
        if (val === null || val === undefined) return null;
        if (val instanceof Date) return val;
        if (Array.isArray(val)) {
            // Arrays of primitives (strings/numbers) → PostgreSQL array literal for TEXT[] columns
            if (val.length === 0) return '{}';
            if (val.every(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
                return '{' + val.map(v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
            }
            // Arrays of objects → JSON string for JSONB columns
            return JSON.stringify(val);
        }
        if (typeof val === 'object' && val.constructor === Object) {
            return JSON.stringify(val);
        }
        return val;
    }

    _buildInsert() {
        const rows = this._insertData;
        if (!rows || rows.length === 0) {
            return { sql: `SELECT 1 WHERE FALSE`, values: [] };
        }

        const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const values = [];
        const rowPlaceholders = [];

        for (const row of rows) {
            const placeholders = allKeys.map(key => {
                values.push(this._prepareValue(row[key] !== undefined ? row[key] : null));
                return `$${values.length}`;
            });
            rowPlaceholders.push(`(${placeholders.join(', ')})`);
        }

        const colList = allKeys.map(k => `"${k}"`).join(', ');
        let sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${rowPlaceholders.join(', ')}`;

        if (this._returnData) {
            sql += ' RETURNING *';
        }

        return { sql, values };
    }

    _buildUpdate() {
        const data = this._updateData;
        const keys = Object.keys(data);
        const values = [...this._values];
        const baseOffset = values.length;

        const setClauses = keys.map((key, i) => {
            values.push(this._prepareValue(data[key]));
            return `"${key}" = $${baseOffset + i + 1}`;
        });

        let sql = `UPDATE "${this._table}" SET ${setClauses.join(', ')}`;

        if (this._wheres.length > 0) {
            sql += ` WHERE ${this._wheres.join(' AND ')}`;
        }

        if (this._returnData) {
            sql += ' RETURNING *';
        }

        return { sql, values };
    }

    _buildDelete() {
        let sql = `DELETE FROM "${this._table}"`;

        if (this._wheres.length > 0) {
            sql += ` WHERE ${this._wheres.join(' AND ')}`;
        }

        if (this._returnData) {
            sql += ' RETURNING *';
        }

        return { sql, values: this._values };
    }

    _buildUpsert() {
        const rows = this._insertData;
        if (!rows || rows.length === 0) {
            return { sql: `SELECT 1 WHERE FALSE`, values: [] };
        }

        const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const values = [];
        const rowPlaceholders = [];

        for (const row of rows) {
            const placeholders = allKeys.map(key => {
                values.push(this._prepareValue(row[key] !== undefined ? row[key] : null));
                return `$${values.length}`;
            });
            rowPlaceholders.push(`(${placeholders.join(', ')})`);
        }

        const colList = allKeys.map(k => `"${k}"`).join(', ');
        // Support multi-column conflict: 'col1,col2' or ['col1','col2']
        const rawConflict = this._upsertConflict || 'id';
        const conflictCols = Array.isArray(rawConflict)
            ? rawConflict.map(c => c.trim())
            : String(rawConflict).split(',').map(c => c.trim());
        const conflictTarget = conflictCols.map(c => `"${c}"`).join(', ');
        const conflictSet = new Set(conflictCols);
        const updateCols = allKeys
            .filter(k => !conflictSet.has(k))
            .map(k => `"${k}" = EXCLUDED."${k}"`)
            .join(', ');

        let sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${rowPlaceholders.join(', ')}`;
        sql += ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateCols}`;

        if (this._returnData) {
            sql += ' RETURNING *';
        }

        return { sql, values };
    }

    // Make it thenable (works with await)
    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    catch(fn) {
        return this._execute().catch(fn);
    }
}

// =====================================================================
// OR Condition Parser
// =====================================================================

function splitOrConditions(str) {
    // Split on commas, but not inside parentheses
    const parts = [];
    let current = '';
    let depth = 0;
    for (const ch of str) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current);
    return parts;
}

function parseCondition(cond, values, mainTable) {
    // Pattern: "column.operator.value" or "column.operator"
    // Examples: "telefone.ilike.%123456789", "scheduled_date.is.null", "scheduled_date.eq.2025-01-01"

    const dotIndex = cond.indexOf('.');
    if (dotIndex === -1) return null;

    const col = cond.substring(0, dotIndex);
    const rest = cond.substring(dotIndex + 1);

    const opIndex = rest.indexOf('.');
    let op, val;

    if (opIndex === -1) {
        op = rest;
        val = null;
    } else {
        op = rest.substring(0, opIndex);
        val = rest.substring(opIndex + 1);
    }

    const quotedCol = col.includes('.') ? `"_${col.split('.')[0]}"."${col.split('.')[1]}"` : `"${mainTable}"."${col}"`;

    switch (op) {
        case 'eq':
            values.push(val);
            return { sql: `${quotedCol} = $${values.length}`, values };
        case 'neq':
            values.push(val);
            return { sql: `${quotedCol} != $${values.length}`, values };
        case 'gt':
            values.push(val);
            return { sql: `${quotedCol} > $${values.length}`, values };
        case 'gte':
            values.push(val);
            return { sql: `${quotedCol} >= $${values.length}`, values };
        case 'lt':
            values.push(val);
            return { sql: `${quotedCol} < $${values.length}`, values };
        case 'lte':
            values.push(val);
            return { sql: `${quotedCol} <= $${values.length}`, values };
        case 'like':
            values.push(val);
            return { sql: `${quotedCol} LIKE $${values.length}`, values };
        case 'ilike':
            values.push(val);
            return { sql: `${quotedCol} ILIKE $${values.length}`, values };
        case 'is':
            if (val === 'null') {
                return { sql: `${quotedCol} IS NULL`, values };
            }
            values.push(val);
            return { sql: `${quotedCol} IS $${values.length}`, values };
        case 'in':
            // value is like "(a,b,c)"
            const inVals = val.replace(/[()]/g, '').split(',');
            const placeholders = inVals.map(v => {
                values.push(v.trim());
                return `$${values.length}`;
            });
            return { sql: `${quotedCol} IN (${placeholders.join(', ')})`, values };
        default:
            console.warn(`⚠️ [DB] Unknown OR operator: ${op}`);
            return null;
    }
}

// =====================================================================
// Auth Stub (for supabase.auth.getUser compatibility)
// =====================================================================

const auth = {
    async getUser(token) {
        // In self-hosted mode, validate JWT manually or skip auth
        // For now, return a stub. Implement real JWT validation if needed.
        try {
            if (!token) return { data: null, error: new Error('No token provided') };

            // Decode JWT payload (without verification for now)
            const parts = token.split('.');
            if (parts.length !== 3) return { data: null, error: new Error('Invalid token') };

            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return {
                data: {
                    user: {
                        id: payload.sub || payload.user_id || 'unknown',
                        email: payload.email || null,
                        role: payload.role || 'authenticated',
                    }
                },
                error: null
            };
        } catch (err) {
            return { data: null, error: err };
        }
    }
};

// =====================================================================
// Export (drop-in replacement for createClient)
// =====================================================================

const db = {
    from: (table) => new QueryBuilder(table),
    auth,
    pool, // Expose pool for direct queries if needed
    // Helper: raw query
    query: (sql, values) => pool.query(sql, values),
};

module.exports = db;
