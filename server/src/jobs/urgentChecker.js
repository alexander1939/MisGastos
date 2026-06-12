const cron = require('node-cron');
const { pool } = require('../config/db');

async function markUrgent() {
  const { rowCount } = await pool.query(
    `UPDATE purchases SET status = 'urgente'
     WHERE status = 'pendiente'
       AND date <= DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '5 days'`
  );
  if (rowCount) console.log(`[cron] marked ${rowCount} purchases as urgente`);
}

function startJobs() {
  // Runs daily at 8am
  cron.schedule('0 8 * * *', () => {
    markUrgent().catch(err => console.error('[cron] urgentChecker error:', err));
  });
  console.log('[cron] urgentChecker scheduled');
}

module.exports = { startJobs };
