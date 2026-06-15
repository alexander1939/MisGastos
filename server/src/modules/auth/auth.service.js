const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../config/db');
const { redis } = require('../../config/redis');
const { env } = require('../../config/env');

function signAccess(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function signRefresh(userId) {
  return jwt.sign({ sub: userId }, env.REFRESH_TOKEN_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN });
}

async function createQuincenaEvents(userId, client) {
  const now = new Date();
  for (let m = 0; m < 3; m++) {
    const month = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const y = month.getFullYear();
    const mo = String(month.getMonth() + 1).padStart(2, '0');
    await client.query(
      `INSERT INTO calendar_events (user_id, title, type, date, repeat, auto_generated)
       VALUES ($1, 'Quincena', 'quincena', $2, 'biweekly', true),
              ($1, 'Quincena', 'quincena', $3, 'biweekly', true)
       ON CONFLICT DO NOTHING`,
      [userId, `${y}-${mo}-01`, `${y}-${mo}-16`]
    );
  }
}

async function register({ email, name, password, salary }) {
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO users (email, name, password, salary) VALUES ($1,$2,$3,$4) RETURNING id, email, name, salary',
      [email, name, hash, salary || 0]
    );
    const user = rows[0];
    await createQuincenaEvents(user.id, client);
    await client.query('COMMIT');

    const accessToken = signAccess(user.id);
    const refreshToken = signRefresh(user.id);
    return { user, accessToken, refreshToken };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const e = new Error('Email already registered'); e.status = 409; throw e;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function login({ email, password }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  const user = rows[0];
  if (!user) { const e = new Error('Invalid credentials'); e.status = 401; throw e; }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) { const e = new Error('Invalid credentials'); e.status = 401; throw e; }

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id);
  const { password: _, ...safe } = user;
  return { user: safe, accessToken, refreshToken };
}

async function refresh(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET);
    const accessToken = signAccess(payload.sub);
    return { accessToken };
  } catch {
    const e = new Error('Invalid refresh token'); e.status = 401; throw e;
  }
}

async function logout(accessToken) {
  try {
    const payload = jwt.decode(accessToken);
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) await redis.setex(`bl:${accessToken}`, ttl, '1');
  } catch {}
}

async function getMe(userId) {
  const { rows } = await pool.query(
    'SELECT id, email, name, salary, created_at FROM users WHERE id = $1',
    [userId]
  );
  return rows[0];
}

async function updateMe(userId, data) {
  const fields = [];
  const values = [];
  let i = 1;
  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.salary !== undefined) { fields.push(`salary = $${i++}`); values.push(data.salary); }
  if (data.password !== undefined) {
    fields.push(`password = $${i++}`);
    values.push(await bcrypt.hash(data.password, 12));
  }
  if (!fields.length) { const e = new Error('Nothing to update'); e.status = 400; throw e; }
  values.push(userId);
  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, email, name, salary`,
    values
  );
  return rows[0];
}

async function deleteMe(userId) {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

module.exports = { register, login, refresh, logout, getMe, updateMe, deleteMe };
