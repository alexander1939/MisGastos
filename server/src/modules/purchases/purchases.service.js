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
  // Si hay tarjeta, verificar si es débito/transporte
  let cardType = null;
  if (data.card_id) {
    const { rows: [card] } = await pool.query(
      'SELECT type FROM cards WHERE id = $1 AND user_id = $2',
      [data.card_id, userId]
    );
    cardType = card?.type;
  }

  const isDebit = cardType === 'debito' || cardType === 'transporte';
  // Efectivo (sin tarjeta) o débito → pagado inmediatamente
  const status = data.status ?? (isDebit || !data.card_id ? 'pagado' : 'pendiente');

  const { rows } = await pool.query(
    `INSERT INTO purchases (user_id, card_id, description, amount, category, months, date, pay_month, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, data.card_id, data.description, data.amount, data.category, data.months || 1, data.date, data.pay_month || null, status]
  );

  // Débito: crear retiro para descontar del saldo de la tarjeta
  if (isDebit && data.card_id) {
    await pool.query(
      `INSERT INTO transfers (user_id, from_card_id, to_card_id, amount, description, date, type)
       VALUES ($1, $2, NULL, $3, $4, $5, 'compra')`,
      [userId, data.card_id, data.amount, `Compra: ${rows[0].description}`, data.date]
    );
  }

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

async function payCard(userId, { cardId, month, fromCardName }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Busca compras pendientes/urgentes de esa tarjeta cuyo effective pay_month = month
    const { rows: pending } = await client.query(
      `SELECT p.id, p.amount
       FROM purchases p
       LEFT JOIN cards c ON c.id = p.card_id
       WHERE p.user_id = $1
         AND p.card_id = $2
         AND p.status IN ('pendiente', 'urgente')
         AND COALESCE(
           p.pay_month,
           CASE
             WHEN EXTRACT(DAY FROM p.date) <= COALESCE(c.cut_day, 31)
               THEN TO_CHAR(p.date, 'YYYY-MM')
             ELSE TO_CHAR(p.date + INTERVAL '1 month', 'YYYY-MM')
           END
         ) = $3`,
      [userId, cardId, month]
    );

    if (!pending.length) {
      const e = new Error('Sin compras pendientes para este ciclo'); e.status = 400; throw e;
    }

    const total = pending.reduce((s, p) => s + parseFloat(p.amount), 0);

    // Marca todas como pagado
    await client.query(
      `UPDATE purchases SET status = 'pagado'
       WHERE id = ANY($1) AND user_id = $2`,
      [pending.map(p => p.id), userId]
    );

    // Registra en transferencias: débito → crédito (el balance se maneja aquí, sin crear transaction)
    if (fromCardName) {
      const { rows: [fromCard] } = await client.query(
        `SELECT id FROM cards WHERE user_id = $1 AND name = $2 LIMIT 1`,
        [userId, fromCardName]
      );

      await client.query(
        `INSERT INTO transfers (user_id, from_card_id, to_card_id, amount, description, date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
        [userId, fromCard?.id || null, cardId, total,
          `Pago tarjeta — ciclo ${month}`]
      );
    }

    await client.query('COMMIT');
    await invalidateCards(userId);
    return { paid: pending.length, total };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function escapeCsvField(val) {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(userId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(p.date, 'YYYY-MM-DD') AS date, p.description, p.amount, p.category, p.months,
            COALESCE(c.name, '') AS card_name, COALESCE(p.pay_month, '') AS pay_month, p.status
     FROM purchases p LEFT JOIN cards c ON c.id = p.card_id
     WHERE p.user_id = $1
     ORDER BY p.date DESC, p.created_at DESC`,
    [userId]
  );
  const header = 'fecha,descripcion,monto,categoria,meses,tarjeta,mes_pago,estado';
  const lines = rows.map(r =>
    [r.date, r.description, r.amount, r.category, r.months, r.card_name, r.pay_month, r.status]
      .map(escapeCsvField).join(',')
  );
  return [header, ...lines].join('\n');
}

async function importCsv(userId, rows) {
  // Cargar tarjetas del usuario una sola vez para resolver card_id por nombre
  const { rows: cards } = await pool.query(
    'SELECT id, name FROM cards WHERE user_id = $1', [userId]
  );
  const cardMap = Object.fromEntries(cards.map(c => [c.name.toLowerCase(), c.id]));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const cardId = row.card_name ? (cardMap[row.card_name.toLowerCase()] || null) : null;
      const status = ['pendiente', 'pagado', 'archivado', 'urgente'].includes(row.status)
        ? row.status : 'pendiente';
      await client.query(
        `INSERT INTO purchases (user_id, card_id, description, amount, category, months, date, pay_month, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId, cardId, row.description, row.amount, row.category,
         row.months || 1, row.date, row.pay_month || null, status]
      );
    }
    await client.query('COMMIT');
    await invalidateCards(userId);
    return { imported: rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, stats, create, update, updateStatus, remove, payCard, exportCsv, importCsv };
