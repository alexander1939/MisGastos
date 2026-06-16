const { pool } = require('../../config/db');
const { redis } = require('../../config/redis');

function invalidateAnalytics(userId) {
  return redis.del(
    `analytics:cat:${userId}:mes`,
    `analytics:cat:${userId}:semana`,
    `analytics:cat:${userId}:all`,
    `analytics:method:${userId}:mes`,
    `analytics:trend:${userId}:30`,
    `analytics:monthly:${userId}:6`
  );
}

async function list(userId, { period, category, method, from, to, page = 1, limit = 20 }) {
  limit = Math.min(parseInt(limit) || 20, 500);
  const where = ['t.user_id = $1'];
  const values = [userId];
  let i = 2;

  if (period === 'semana') {
    where.push(`t.date >= NOW() - INTERVAL '7 days'`);
  } else if (period === 'quincena') {
    const day = new Date().getDate();
    where.push(day <= 15
      ? `t.date >= DATE_TRUNC('month', NOW())`
      : `t.date >= DATE_TRUNC('month', NOW()) + INTERVAL '15 days'`);
  } else if (period === 'mes') {
    where.push(`t.date >= DATE_TRUNC('month', NOW()) AND t.date <= CURRENT_DATE`);
  }

  if (from) { where.push(`t.date >= $${i++}`); values.push(from); }
  if (to)   { where.push(`t.date <= $${i++}`); values.push(to); }
  if (category) { where.push(`t.category = $${i++}`); values.push(category); }
  if (method)   { where.push(`t.method = $${i++}`); values.push(method); }

  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT * FROM transactions t WHERE ${where.join(' AND ')}
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...values, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM transactions t WHERE ${where.join(' AND ')}`,
    values
  );
  return { data: rows, total: parseInt(count), page, limit };
}

async function summary(userId, { period, from, to }) {
  const where = ['user_id = $1'];
  const values = [userId];
  let i = 2;

  if (period === 'mes') where.push(`date >= DATE_TRUNC('month', NOW()) AND date <= CURRENT_DATE`);
  if (from) { where.push(`date >= $${i++}`); values.push(from); }
  if (to)   { where.push(`date <= $${i++}`); values.push(to); }

  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type='ingreso' THEN amount END), 0) AS ingresos,
       COALESCE(SUM(CASE WHEN type='gasto'   THEN amount END), 0) AS gastos
     FROM transactions WHERE ${where.join(' AND ')}`,
    values
  );
  return rows[0];
}

async function create(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO transactions (user_id, amount, type, category, method, description, date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.amount, data.type, data.category, data.method, data.description, data.date]
  );
  await invalidateAnalytics(userId);
  return rows[0];
}

async function update(userId, id, data) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { fields.push(`${k} = $${i++}`); values.push(v); }
  }
  if (!fields.length) { const e = new Error('Nothing to update'); e.status = 400; throw e; }
  values.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  if (!rows[0]) { const e = new Error('Not found'); e.status = 404; throw e; }
  await invalidateAnalytics(userId);
  return rows[0];
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
  await invalidateAnalytics(userId);
}

async function importCsv(userId, rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, method, description, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, row.amount, row.type, row.category, row.method, row.description, row.date]
      );
    }
    await client.query('COMMIT');
    await invalidateAnalytics(userId);
    return { imported: rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function accountBalance(userId) {
  const { rows } = await pool.query(
    `SELECT
       account,
       SUM(ingresos)  AS ingresos,
       SUM(gastos)    AS gastos,
       SUM(recibido)  AS recibido,
       SUM(enviado)   AS enviado
     FROM (
       SELECT
         method AS account,
         SUM(CASE WHEN type='ingreso' THEN amount ELSE 0 END) AS ingresos,
         SUM(CASE WHEN type='gasto'   THEN amount ELSE 0 END) AS gastos,
         0 AS recibido,
         0 AS enviado
       FROM transactions
       WHERE user_id = $1 AND method IS NOT NULL AND method != ''
         AND date <= CURRENT_DATE
       GROUP BY method

       UNION ALL

       SELECT c.name AS account, 0, 0, t.amount AS recibido, 0
       FROM transfers t
       JOIN cards c ON c.id = t.to_card_id
       WHERE t.user_id = $1 AND t.date <= CURRENT_DATE

       UNION ALL

       SELECT c.name AS account, 0, 0, 0, t.amount AS enviado
       FROM transfers t
       JOIN cards c ON c.id = t.from_card_id
       WHERE t.user_id = $1 AND t.date <= CURRENT_DATE
     ) sub
     GROUP BY account
     ORDER BY (SUM(ingresos) + SUM(recibido) - SUM(gastos) - SUM(enviado)) DESC`,
    [userId]
  );
  return rows;
}

function escapeCsvField(val) {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(userId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, type, category, amount, method, description
     FROM transactions WHERE user_id = $1
     ORDER BY date DESC, created_at DESC`,
    [userId]
  );
  const header = 'fecha,tipo,categoria,monto,metodo,descripcion';
  const lines = rows.map(r =>
    [r.date, r.type, r.category, r.amount, r.method || '', r.description || '']
      .map(escapeCsvField).join(',')
  );
  return [header, ...lines].join('\n');
}

module.exports = { list, summary, create, update, remove, importCsv, accountBalance, exportCsv };
