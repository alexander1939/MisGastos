const { redis } = require('../config/redis');

function rateLimiter({ max = 5, windowSec = 60 } = {}) {
  return async (req, res, next) => {
    try {
      const key = `rl:${req.ip}:${req.path}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      if (count > max) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch (err) {
      console.error('[rateLimiter] redis error:', err.message);
    }
    next();
  };
}

module.exports = rateLimiter;
