const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { redis } = require('../config/redis');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const blacklisted = await redis.get(`bl:${token}`);
    if (blacklisted) return res.status(401).json({ error: 'Token revoked' });

    const payload = jwt.verify(token, env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = auth;
