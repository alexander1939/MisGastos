const cron = require('node-cron');
const { pool } = require('../config/db');

async function markUrgent() {
  // Marca urgente: fecha de pago de la tarjeta está entre hoy y 5 días adelante
  await pool.query(`
    UPDATE purchases p
    SET status = 'urgente'
    FROM cards c
    WHERE p.status = 'pendiente'
      AND p.card_id = c.id
      AND c.pay_day IS NOT NULL
      AND (
        TO_DATE(
          COALESCE(p.pay_month,
            CASE
              WHEN EXTRACT(DAY FROM p.date::date) <= c.cut_day
              THEN TO_CHAR(p.date::date, 'YYYY-MM')
              ELSE TO_CHAR((DATE_TRUNC('month', p.date::date) + INTERVAL '1 month')::date, 'YYYY-MM')
            END
          ) || '-' || LPAD(c.pay_day::text, 2, '0'),
          'YYYY-MM-DD'
        )
      ) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
  `);

  // Revierte a pendiente compras que quedaron urgentes pero su fecha de pago aún está lejos
  await pool.query(`
    UPDATE purchases p
    SET status = 'pendiente'
    FROM cards c
    WHERE p.status = 'urgente'
      AND p.card_id = c.id
      AND c.pay_day IS NOT NULL
      AND (
        TO_DATE(
          COALESCE(p.pay_month,
            CASE
              WHEN EXTRACT(DAY FROM p.date::date) <= c.cut_day
              THEN TO_CHAR(p.date::date, 'YYYY-MM')
              ELSE TO_CHAR((DATE_TRUNC('month', p.date::date) + INTERVAL '1 month')::date, 'YYYY-MM')
            END
          ) || '-' || LPAD(c.pay_day::text, 2, '0'),
          'YYYY-MM-DD'
        )
      ) > CURRENT_DATE + INTERVAL '5 days'
  `);
}

function startJobs() {
  markUrgent().catch(err => console.error('[cron] urgentChecker error:', err));
  cron.schedule('0 8 * * *', () => {
    markUrgent().catch(err => console.error('[cron] urgentChecker error:', err));
  });
  console.log('[cron] urgentChecker scheduled');
}

module.exports = { startJobs };
