const service = require('./archive.service');

async function list(req, res, next) {
  try { res.json(await service.list(req.userId)); } catch (err) { next(err); }
}

async function getMonth(req, res, next) {
  try { res.json(await service.getMonth(req.userId, req.params.monthKey)); } catch (err) { next(err); }
}

async function closeMonth(req, res, next) {
  try { res.json(await service.closeMonth(req.userId)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { await service.remove(req.userId, req.params.monthKey); res.json({ ok: true }); } catch (err) { next(err); }
}

module.exports = { list, getMonth, closeMonth, remove };
