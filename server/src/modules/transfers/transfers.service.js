const { pool } = require('../../config/db');
const { redis } = require('../../config/redis');

const invalidateAll = (userId) => redis.del(
  `analytics:cards:${userId}`,
  `analytics:cat:${userId}:mes`,
  `analytics:cat:${userId}:semana`,
  `analytics:cat:${userId}:all`,
  `analytics:monthly:${userId}:6`,
  `analytics:method:${userId}:mes`,
  `analytics:trend:${userId}:30`
);

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Registrar la transferencia
    const { rows: [transfer] } = await client.query(
      `INSERT INTO transfers (user_id, from_card_id, to_card_id, amount, description, date, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, data.from_card_id || null, data.to_card_id || null,
       data.amount, data.description || null, data.date, type]
    );

    // Si el destino es una tarjeta de crédito, marcar compras pendientes del ciclo como pagadas
    if (data.to_card_id) {
      const { rows: [toCard] } = await client.query(
        `SELECT id, type FROM cards WHERE id = $1 AND user_id = $2`,
        [data.to_card_id, userId]
      );

      if (toCard?.type === 'credito') {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        await client.query(
          `UPDATE purchases SET status = 'pagado'
           WHERE user_id = $1
             AND card_id = $2
             AND status IN ('pendiente', 'urgente')
             AND COALESCE(
               pay_month,
               CASE
                 WHEN EXTRACT(DAY FROM date) <= COALESCE(
                   (SELECT cut_day FROM cards WHERE id = $2), 31
                 )
                   THEN TO_CHAR(date, 'YYYY-MM')
                 ELSE TO_CHAR(date + INTERVAL '1 month', 'YYYY-MM')
               END
             ) = $3`,
          [userId, data.to_card_id, month]
        );
      }
    }

    await client.query('COMMIT');
    await invalidateAll(userId);
    return transfer;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function remove(userId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM transfers WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

function escapeCsvField(val) {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(userId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(t.date, 'YYYY-MM-DD') AS date,
            COALESCE(t.description, '') AS description,
            t.amount,
            COALESCE(t.type, 'transfer') AS type,
            COALESCE(fc.name, '') AS from_card,
            COALESCE(tc.name, '') AS to_card
     FROM transfers t
     LEFT JOIN cards fc ON fc.id = t.from_card_id
     LEFT JOIN cards tc ON tc.id = t.to_card_id
     WHERE t.user_id = $1
     ORDER BY t.date DESC, t.created_at DESC`,
    [userId]
  );
  const header = 'fecha,descripcion,monto,tipo,desde,hacia';
  const lines = rows.map(r =>
    [r.date, r.description, r.amount, r.type, r.from_card, r.to_card]
      .map(escapeCsvField).join(',')
  );
  return [header, ...lines].join('\n');
}

async function importCsv(userId, rows) {
  const { rows: cards } = await pool.query('SELECT id, name FROM cards WHERE user_id = $1', [userId]);
  const cardMap = Object.fromEntries(cards.map(c => [c.name.toLowerCase(), c.id]));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const fromId = row.from_card ? (cardMap[row.from_card.toLowerCase()] || null) : null;
      const toId   = row.to_card   ? (cardMap[row.to_card.toLowerCase()]   || null) : null;
      const type   = row.type === 'retiro' ? 'retiro' : 'transfer';
      await client.query(
        `INSERT INTO transfers (user_id, from_card_id, to_card_id, amount, description, date, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, fromId, toId, row.amount, row.description || null, row.date, type]
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

module.exports = { list, create, remove, exportCsv, importCsv };
