const service = require('./cards.service');

async function list(req, res, next) {
  try { res.json(await service.list(req.userId)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await service.create(req.userId, req.body)); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json(await service.update(req.userId, req.params.id, req.body)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { await service.remove(req.userId, req.params.id); res.json({ ok: true }); } catch (err) { next(err); }
}

async function summary(req, res, next) {
  try { res.json(await service.summary(req.userId, req.params.id)); } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, summary };
