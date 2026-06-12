const svc = require('./transfers.service');

async function getAll(req, res, next) {
  try { res.json(await svc.list(req.userId)); } catch (e) { next(e); }
}

async function create(req, res, next) {
  try { res.status(201).json(await svc.create(req.userId, req.body)); } catch (e) { next(e); }
}

async function del(req, res, next) {
  try { await svc.remove(req.userId, req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
}

module.exports = { getAll, create, del };
