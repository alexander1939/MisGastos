const { pool } = require('../../config/db');

async function list(userId) {
  const { rows } = await pool.query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY category', [userId]);
  return rows;
}

async function upsert(userId, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO budgets (user_id, category, amount, period)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, category) DO UPDATE SET amount = EXCLUDED.amount, period = EXCLUDED.period`,
        [userId, item.category, item.amount, item.period || 'mes']
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function status(userId) {
  const { rows } = await pool.query(
    `SELECT b.category, b.amount AS budget, b.period,
       COALESCE(SUM(t.amount), 0) AS spent,
       ROUND(COALESCE(SUM(t.amount), 0) / NULLIF(b.amount, 0) * 100, 1) AS pct
     FROM budgets b
     LEFT JOIN transactions t ON t.user_id = b.user_id
       AND t.category = b.category
       AND t.type = 'gasto'
       AND t.date >= DATE_TRUNC('month', NOW())
     WHERE b.user_id = $1
     GROUP BY b.category, b.amount, b.period
     ORDER BY pct DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

module.exports = { list, upsert, status };
