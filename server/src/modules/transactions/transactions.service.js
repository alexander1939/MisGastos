const { pool } = require('../../config/db');

async function list(userId, { period, category, method, from, to, page = 1, limit = 20 }) {
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
    where.push(`t.date >= DATE_TRUNC('month', NOW())`);
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

  if (period === 'mes') where.push(`date >= DATE_TRUNC('month', NOW())`);
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
  return rows[0];
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
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
    return { imported: rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, summary, create, update, remove, importCsv };
