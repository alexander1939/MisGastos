const { pool } = require('../../config/db');
const { redis } = require('../../config/redis');

const TTL = 30; // 30 segundos — datos siempre frescos

async function cached(key, fn) {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const data = await fn();
  await redis.setex(key, TTL, JSON.stringify(data));
  return data;
}

async function byCategory(userId, { period } = {}) {
  return cached(`analytics:cat:${userId}:${period || 'all'}`, async () => {
    const df = period === 'mes'    ? `AND date >= DATE_TRUNC('month', NOW())`
             : period === 'semana' ? `AND date >= NOW() - INTERVAL '7 days'`
             : '';
    const { rows } = await pool.query(
      `SELECT category, SUM(total) AS total
       FROM (
         SELECT category, amount AS total
         FROM transactions
         WHERE user_id = $1 AND type = 'gasto' ${df}
         UNION ALL
         SELECT category, amount AS total
         FROM purchases
         WHERE user_id = $1 AND status != 'archivado' ${df}
       ) sub
       GROUP BY category ORDER BY total DESC`,
      [userId]
    );
    return rows;
  });
}

async function byMethod(userId, { period } = {}) {
  return cached(`analytics:method:${userId}:${period || 'all'}`, async () => {
    const df = period === 'mes' ? `AND date >= DATE_TRUNC('month', NOW())` : '';
    const { rows } = await pool.query(
      `SELECT method, SUM(amount) AS total FROM transactions
       WHERE user_id = $1 AND type = 'gasto' ${df}
       GROUP BY method ORDER BY total DESC`,
      [userId]
    );
    return rows;
  });
}

async function trend(userId, { days = 30 } = {}) {
  return cached(`analytics:trend:${userId}:${days}`, async () => {
    const d = parseInt(days);
    const { rows } = await pool.query(
      `SELECT date, SUM(gastos) AS gastos, SUM(ingresos) AS ingresos
       FROM (
         SELECT date,
                CASE WHEN type='gasto'   THEN amount ELSE 0 END AS gastos,
                CASE WHEN type='ingreso' THEN amount ELSE 0 END AS ingresos
         FROM transactions
         WHERE user_id = $1 AND date >= NOW() - INTERVAL '${d} days'
         UNION ALL
         SELECT date, amount AS gastos, 0 AS ingresos
         FROM purchases
         WHERE user_id = $1
           AND status != 'archivado'
           AND date >= NOW() - INTERVAL '${d} days'
       ) sub
       GROUP BY date ORDER BY date`,
      [userId]
    );
    return rows;
  });
}

async function cardsDebt(userId) {
  return cached(`analytics:cards:${userId}`, async () => {
    const { rows } = await pool.query(
      `SELECT c.name, c.color,
              COALESCE(SUM(p.amount), 0) AS deuda,
              c.credit_limit
       FROM cards c
       LEFT JOIN purchases p ON p.card_id = c.id AND p.status IN ('pendiente', 'urgente')
       WHERE c.user_id = $1
       GROUP BY c.id, c.name, c.color, c.credit_limit`,
      [userId]
    );
    return rows;
  });
}

async function monthlyComparison(userId, { months = 6 } = {}) {
  return cached(`analytics:monthly:${userId}:${months}`, async () => {
    const interval = `${parseInt(months) - 1} months`;
    const { rows } = await pool.query(
      `SELECT month, SUM(ingresos) AS ingresos, SUM(gastos) AS gastos
       FROM (
         SELECT TO_CHAR(date,'YYYY-MM') AS month,
                CASE WHEN type='ingreso' THEN amount ELSE 0 END AS ingresos,
                CASE WHEN type='gasto'   THEN amount ELSE 0 END AS gastos
         FROM transactions
         WHERE user_id = $1
           AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '${interval}'
         UNION ALL
         SELECT TO_CHAR(date,'YYYY-MM') AS month, 0 AS ingresos, amount AS gastos
         FROM purchases
         WHERE user_id = $1
           AND status != 'archivado'
           AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '${interval}'
       ) sub
       GROUP BY month ORDER BY month`,
      [userId]
    );
    return rows;
  });
}

module.exports = { byCategory, byMethod, trend, cardsDebt, monthlyComparison };
