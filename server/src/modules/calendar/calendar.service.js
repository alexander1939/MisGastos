const { pool } = require('../../config/db');

function urgency(event) {
  if (event.done) return null;
  const diff = Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
  if (diff <= 1) return 'urgente';
  if (diff <= 4) return 'pronto';
  return 'ok';
}

async function list(userId, { month, type }) {
  const where = ['user_id = $1'];
  const values = [userId];
  let i = 2;

  if (month) {
    where.push(`TO_CHAR(date, 'YYYY-MM') = $${i++}`);
    values.push(month);
  }
  if (type) {
    where.push(`type = $${i++}`);
    values.push(type);
  }

  const { rows } = await pool.query(
    `SELECT * FROM calendar_events WHERE ${where.join(' AND ')} ORDER BY date`,
    values
  );
  return rows.map(e => ({ ...e, urgency: urgency(e) }));
}

async function upcoming(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM calendar_events
     WHERE user_id = $1 AND date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
     ORDER BY date`,
    [userId]
  );
  return rows.map(e => ({ ...e, urgency: urgency(e) }));
}

async function create(userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO calendar_events (user_id, title, type, date, amount, note, repeat)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.title, data.type, data.date, data.amount, data.note, data.repeat || 'none']
  );
  return { ...rows[0], urgency: urgency(rows[0]) };
}

async function update(userId, id, data) {
  const allowed = ['title', 'type', 'date', 'amount', 'note', 'repeat'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k} = $${i++}`); values.push(data[k]); }
  }
  if (!fields.length) { const e = new Error('Nothing to update'); e.status = 400; throw e; }
  values.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE calendar_events SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  if (!rows[0]) { const e = new Error('Not found'); e.status = 404; throw e; }
  return { ...rows[0], urgency: urgency(rows[0]) };
}

async function toggleDone(userId, id) {
  const { rows } = await pool.query(
    `UPDATE calendar_events SET done = NOT done WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  if (!rows[0]) { const e = new Error('Not found'); e.status = 404; throw e; }
  return { ...rows[0], urgency: urgency(rows[0]) };
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2', [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

module.exports = { list, upcoming, create, update, toggleDone, remove };
