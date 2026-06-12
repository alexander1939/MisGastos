const Redis = require('ioredis');
const { env } = require('./env');

const redis = new Redis(env.REDIS_URL);

redis.on('error', (err) => console.error('[redis] error:', err));
redis.on('connect', () => console.log('[redis] connected'));

module.exports = { redis };
