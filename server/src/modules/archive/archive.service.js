const { pool } = require('../../config/db');

async function list(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM archive_months WHERE user_id = $1 ORDER BY month_key DESC', [userId]
  );
  return rows;
}

async function getMonth(userId, monthKey) {
  const { rows: [month] } = await pool.query(
    'SELECT * FROM archive_months WHERE user_id = $1 AND month_key = $2', [userId, monthKey]
  );
  if (!month) { const e = new Error('Not found'); e.status = 404; throw e; }
  const { rows: items } = await pool.query(
    'SELECT * FROM archive_items WHERE archive_month_id = $1 ORDER BY original_date DESC', [month.id]
  );
  return { ...month, items };
}

async function closeMonth(userId) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const label = now.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  const { rows: paid } = await pool.query(
    `SELECT p.*, c.name AS card_name FROM purchases p
     LEFT JOIN cards c ON c.id = p.card_id
     WHERE p.user_id = $1 AND p.status = 'pagado'`,
    [userId]
  );

  const totalPaid = paid.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [month] } = await client.query(
      `INSERT INTO archive_months (user_id, month_key, label, total_paid)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, monthKey, label, totalPaid]
    );
    for (const p of paid) {
      await client.query(
        `INSERT INTO archive_items (archive_month_id, description, amount, category, card_name, months, original_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [month.id, p.description, p.amount, p.category, p.card_name, p.months, p.date]
      );
    }
    if (paid.length) {
      await client.query(
        `UPDATE purchases SET status = 'archivado' WHERE user_id = $1 AND status = 'pagado'`, [userId]
      );
    }
    await client.query(
      `UPDATE purchases SET status = 'urgente' WHERE user_id = $1 AND status = 'pendiente'`, [userId]
    );
    await client.query('COMMIT');
    return { month, items_archived: paid.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function remove(userId, monthKey) {
  const { rowCount } = await pool.query(
    'DELETE FROM archive_months WHERE user_id = $1 AND month_key = $2', [userId, monthKey]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

module.exports = { list, getMonth, closeMonth, remove };
