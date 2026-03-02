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
    },
    dividas: {
        mentorados: { fk: 'mentorado_id', pk: 'id' },
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
    leads: { organizations: { fk: 'organization_id', pk: 'id' } },
    lid_phone_mappings: {},
    auto_messages: {},
    instagram_messages: {},
    profiles: { organizations: { fk: 'organization_id', pk: 'id' } },
    mentorados: { organizations: { fk: 'organization_id', pk: 'id' } },
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
        this._singleRow = false;
        this._operation = 'select'; // select, insert, update, delete, upsert
        this._insertData = null;
        this._updateData = null;
        this._upsertConflict = null;
        this._returnData = false;
    }

    // --- Select ---
    select(cols) {
        if (cols !== undefined) this._selectStr = cols;
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

    not(col, op, val) {
        if (op === 'is' && val === null) {
            this._wheres.push(`"${this._resolveCol(col)}" IS NOT NULL`);
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

    single() {
        this._singleRow = true;
        this._limitVal = 1;
        return this;
    }

    maybeSingle() {
        this._singleRow = true;
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
            const { nestKeys } = this._operation === 'select'
                ? parseSelect(this._selectStr, this._table)
                : { nestKeys: [] };

            // Clean null joins
            if (nestKeys.length > 0) {
                data = data.map(row => cleanNullJoins(row, nestKeys));
            }

            if (this._singleRow) {
                data = data.length > 0 ? data[0] : null;
            }

            return { data, error: null };
        } catch (err) {
            console.error(`❌ [DB] Error in ${this._operation} on "${this._table}":`, err.message);
            return { data: null, error: err };
        }
    }

    _buildSelect() {
        const { columns, joins } = parseSelect(this._selectStr, this._table);

        let sql = `SELECT ${columns.join(', ')} FROM "${this._table}"`;

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

        return { sql, values: this._values };
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
                values.push(row[key] !== undefined ? row[key] : null);
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
            values.push(data[key]);
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
                values.push(row[key] !== undefined ? row[key] : null);
                return `$${values.length}`;
            });
            rowPlaceholders.push(`(${placeholders.join(', ')})`);
        }

        const colList = allKeys.map(k => `"${k}"`).join(', ');
        const conflictCol = this._upsertConflict || 'id';
        const updateCols = allKeys
            .filter(k => k !== conflictCol)
            .map(k => `"${k}" = EXCLUDED."${k}"`)
            .join(', ');

        let sql = `INSERT INTO "${this._table}" (${colList}) VALUES ${rowPlaceholders.join(', ')}`;
        sql += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateCols}`;

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
