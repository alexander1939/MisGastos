const service = require('./budgets.service');

async function list(req, res, next) {
  try { res.json(await service.list(req.userId)); } catch (err) { next(err); }
}

async function upsert(req, res, next) {
  try { await service.upsert(req.userId, req.body.items); res.json({ ok: true }); } catch (err) { next(err); }
}

async function status(req, res, next) {
  try { res.json(await service.status(req.userId)); } catch (err) { next(err); }
}

module.exports = { list, upsert, status };
