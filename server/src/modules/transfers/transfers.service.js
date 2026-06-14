const { pool } = require('../../config/db');

async function list(userId) {
  const { rows } = await pool.query(
    `SELECT t.*,
       fc.name AS from_card_name, fc.color AS from_card_color, fc.type AS from_card_type,
       tc.name AS to_card_name,   tc.color AS to_card_color,   tc.type AS to_card_type
     FROM transfers t
     LEFT JOIN cards fc ON fc.id = t.from_card_id
     LEFT JOIN cards tc ON tc.id = t.to_card_id
     WHERE t.user_id = $1
     ORDER BY t.date DESC, t.created_at DESC`,
    [userId]
  );
  return rows;
}

async function create(userId, data) {
  const type = data.type === 'retiro' ? 'retiro' : 'transfer';
  const { rows } = await pool.query(
    `INSERT INTO transfers (user_id, from_card_id, to_card_id, amount, description, date, type)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.from_card_id || null, data.to_card_id || null, data.amount, data.description || null, data.date, type]
  );
  return rows[0];
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM transfers WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

module.exports = { list, create, remove };
