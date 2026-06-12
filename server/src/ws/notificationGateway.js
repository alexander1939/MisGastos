const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const clients = new Map();

function initWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get('token');
    try {
      const { sub } = jwt.verify(token, env.JWT_SECRET);
      clients.set(sub, ws);
      ws.on('close', () => clients.delete(sub));
    } catch {
      ws.close(1008, 'Invalid token');
    }
  });

  console.log('[ws] gateway ready');
}

function notify(userId, event) {
  const ws = clients.get(String(userId));
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify(event));
  }
}

module.exports = { initWs, notify };
