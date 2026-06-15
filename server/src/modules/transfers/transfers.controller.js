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

async function exportCsv(req, res, next) {
  try {
    const csv = await svc.exportCsv(req.userId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transferencias.csv"');
    res.send(csv);
  } catch (e) { next(e); }
}

async function importCsv(req, res, next) {
  try {
    res.json(await svc.importCsv(req.userId, req.body.rows));
  } catch (e) { next(e); }
}

module.exports = { getAll, create, del, exportCsv, importCsv };
