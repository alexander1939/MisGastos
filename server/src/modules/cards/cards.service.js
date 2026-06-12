const { pool } = require('../../config/db');

async function list(userId) {
  const { rows } = await pool.query('SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at', [userId]);
  return rows;
}

async function create(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO cards (user_id, name, type, color, credit_limit, cut_day, pay_day)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.name, data.type, data.color, data.credit_limit, data.cut_day, data.pay_day]
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
    `UPDATE cards SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  if (!rows[0]) { const e = new Error('Not found'); e.status = 404; throw e; }
  return rows[0];
}

async function remove(userId, id) {
  const { rowCount } = await pool.query('DELETE FROM cards WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

async function summary(userId, id) {
  const { rows: [card] } = await pool.query('SELECT * FROM cards WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!card) { const e = new Error('Not found'); e.status = 404; throw e; }

  const { rows: [{ deuda }] } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS deuda
     FROM purchases WHERE card_id = $1 AND status IN ('pendiente', 'urgente')`,
    [id]
  );

  return {
    ...card,
    deuda: parseFloat(deuda),
    uso_pct: card.credit_limit ? Math.round((deuda / card.credit_limit) * 100) : null,
  };
}

module.exports = { list, create, update, remove, summary };
