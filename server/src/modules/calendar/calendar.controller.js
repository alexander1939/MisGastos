const service = require('./calendar.service');

async function list(req, res, next) {
  try { res.json(await service.list(req.userId, req.query)); } catch (err) { next(err); }
}

async function upcoming(req, res, next) {
  try { res.json(await service.upcoming(req.userId)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await service.create(req.userId, req.body)); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json(await service.update(req.userId, req.params.id, req.body)); } catch (err) { next(err); }
}

async function toggleDone(req, res, next) {
  try { res.json(await service.toggleDone(req.userId, req.params.id)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { await service.remove(req.userId, req.params.id); res.json({ ok: true }); } catch (err) { next(err); }
}

module.exports = { list, upcoming, create, update, toggleDone, remove };
