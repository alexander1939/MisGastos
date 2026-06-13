const { pool } = require('../../config/db');
const { redis } = require('../../config/redis');

const invalidateCards = (userId) => redis.del(
  `analytics:cards:${userId}`,
  `analytics:cat:${userId}:mes`,
  `analytics:cat:${userId}:semana`,
  `analytics:cat:${userId}:all`,
  `analytics:monthly:${userId}:6`
);

async function list(userId, { cardId, status, period, from, to, page = 1, limit = 20 }) {
  const where = ['p.user_id = $1'];
  const values = [userId];
  let i = 2;

  if (cardId) { where.push(`p.card_id = $${i++}`); values.push(cardId); }
  if (status) { where.push(`p.status = $${i++}`); values.push(status); }
  if (from)   { where.push(`p.date >= $${i++}`);   values.push(from); }
  if (to)     { where.push(`p.date <= $${i++}`);   values.push(to); }
  if (!from && !to && period === 'mes') where.push(`p.date >= DATE_TRUNC('month', NOW())`);

  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS card_name, c.color AS card_color
     FROM purchases p LEFT JOIN cards c ON c.id = p.card_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.date DESC LIMIT $${i++} OFFSET $${i++}`,
    [...values, limit, offset]
  );
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM purchases p WHERE ${where.join(' AND ')}`, values
  );
  return { data: rows, total: parseInt(count), page, limit };
}

async function stats(userId) {
  const { rows } = await pool.query(
    `SELECT p.category, c.name AS card_name, SUM(p.amount) AS total, COUNT(*) AS qty
     FROM purchases p LEFT JOIN cards c ON c.id = p.card_id
     WHERE p.user_id = $1 AND p.status != 'archivado'
     GROUP BY p.category, c.name ORDER BY total DESC`,
    [userId]
  );
  return rows;
}

async function create(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO purchases (user_id, card_id, description, amount, category, months, date, pay_month)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.card_id, data.description, data.amount, data.category, data.months || 1, data.date, data.pay_month || null]
  );
  await invalidateCards(userId);
  return rows[0];
}

async function update(userId, id, data) {
  const allowed = ['description', 'amount', 'category', 'months', 'date', 'card_id', 'pay_month'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k} = $${i++}`); values.push(data[k]); }
  }
  if (!fields.length) { const e = new Error('Nothing to update'); e.status = 400; throw e; }
  values.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE purchases SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  if (!rows[0]) { const e = new Error('Not found'); e.status = 404; throw e; }
  return rows[0];
}

const validTransitions = {
  pendiente: ['pagado'],
  urgente: ['pagado'],
  pagado: ['archivado', 'pendiente'],
};

async function updateStatus(userId, id, status) {
  const { rows: [current] } = await pool.query(
    'SELECT status FROM purchases WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!current) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (!validTransitions[current.status]?.includes(status)) {
    const e = new Error(`Cannot transition from ${current.status} to ${status}`); e.status = 400; throw e;
  }
  const { rows } = await pool.query(
    'UPDATE purchases SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [status, id, userId]
  );
  await invalidateCards(userId);
  return rows[0];
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM purchases WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
  await invalidateCards(userId);
}

module.exports = { list, stats, create, update, updateStatus, remove };
