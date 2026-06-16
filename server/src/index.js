const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { env } = require('./config/env');
const { pool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { initWs } = require('./ws/notificationGateway');
const { startJobs } = require('./jobs/urgentChecker');

const authRoutes = require('./modules/auth/auth.routes');
const transactionsRoutes = require('./modules/transactions/transactions.routes');
const cardsRoutes = require('./modules/cards/cards.routes');
const purchasesRoutes = require('./modules/purchases/purchases.routes');
const budgetsRoutes = require('./modules/budgets/budgets.routes');
const archiveRoutes = require('./modules/archive/archive.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const calendarRoutes = require('./modules/calendar/calendar.routes');
const transfersRoutes = require('./modules/transfers/transfers.routes');

async function runMigrations() {
  const dir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
    console.log(`[db] migration ${file} ok`);
  }
}

async function start() {
  await runMigrations();

  const app = express();
  const server = http.createServer(app);

  const allowedOrigins = (env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.some(o => origin === o)) return cb(null, true);
      // en desarrollo, acepta cualquier petición del mismo host en cualquier puerto
      if (env.NODE_ENV !== 'production') return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  const rateLimiter = require('./middleware/rateLimiter');
  app.use('/api/', rateLimiter({ max: 200, windowSec: 15 * 60 }));

  app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/cards', cardsRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/budgets', budgetsRoutes);
  app.use('/api/archive', archiveRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/transfers', transfersRoutes);
  app.use(errorHandler);

  initWs(server);
  startJobs();

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[server] listening on :${env.PORT}`);
  });
}

start().catch(err => {
  console.error('[server] startup error:', err);
  process.exit(1);
});
