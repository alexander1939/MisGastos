const { Pool } = require('pg');
const { env } = require('./env');

const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err) => console.error('[db] unexpected error:', err));

module.exports = { pool };
