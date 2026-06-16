const cron = require('node-cron');
const { pool } = require('../config/db');

async function markUrgent() {
  // Marca urgente cuando la FECHA DE PAGO (pay_day del mes efectivo) está a ≤5 días
  const { rowCount } = await pool.query(`
    UPDATE purchases p
    SET status = 'urgente'
    FROM cards c
    WHERE p.status = 'pendiente'
      AND p.card_id = c.id
      AND c.pay_day IS NOT NULL
      AND (
        TO_DATE(
          COALESCE(
            p.pay_month,
            CASE
              WHEN EXTRACT(DAY FROM p.date::date) <= LEAST(c.cut_day, DATE_PART('days', DATE_TRUNC('month', p.date::date) + INTERVAL '1 month - 1 day')::int)
              THEN TO_CHAR(p.date::date, 'YYYY-MM')
              ELSE TO_CHAR(p.date::date + INTERVAL '1 month', 'YYYY-MM')
            END
          ) || '-' || LPAD(
            LEAST(
              c.pay_day,
              DATE_PART('days', DATE_TRUNC('month',
                TO_DATE(
                  COALESCE(p.pay_month, TO_CHAR(p.date::date, 'YYYY-MM')) || '-01',
                  'YYYY-MM-DD'
                ) + INTERVAL '1 month - 1 day'
              )::date)::int
            )::text,
            2, '0'
          ),
          'YYYY-MM-DD'
        )
      ) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
  `);
  if (rowCount) console.log(`[cron] marked ${rowCount} purchases as urgente`);
}

function startJobs() {
  cron.schedule('0 8 * * *', () => {
    markUrgent().catch(err => console.error('[cron] urgentChecker error:', err));
  });
  console.log('[cron] urgentChecker scheduled');
}

module.exports = { startJobs };
