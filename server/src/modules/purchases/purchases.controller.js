const service = require('./purchases.service');

async function list(req, res, next) {
  try { res.json(await service.list(req.userId, req.query)); } catch (err) { next(err); }
}

async function stats(req, res, next) {
  try { res.json(await service.stats(req.userId)); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await service.create(req.userId, req.body)); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json(await service.update(req.userId, req.params.id, req.body)); } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try { res.json(await service.updateStatus(req.userId, req.params.id, req.body.status)); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { await service.remove(req.userId, req.params.id); res.json({ ok: true }); } catch (err) { next(err); }
}

async function payCard(req, res, next) {
  try { res.json(await service.payCard(req.userId, req.body)); } catch (err) { next(err); }
}

async function exportCsv(req, res, next) {
  try {
    const csv = await service.exportCsv(req.userId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="compras.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}

async function importCsv(req, res, next) {
  try {
    const result = await service.importCsv(req.userId, req.body.rows);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { list, stats, create, update, updateStatus, remove, payCard, exportCsv, importCsv };
