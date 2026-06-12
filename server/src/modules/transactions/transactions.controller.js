const service = require('./transactions.service');

async function list(req, res, next) {
  try {
    const result = await service.list(req.userId, req.query);
    res.json(result);
  } catch (err) { next(err); }
}

async function summary(req, res, next) {
  try {
    const result = await service.summary(req.userId, req.query);
    res.json(result);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const t = await service.create(req.userId, req.body);
    res.status(201).json(t);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const t = await service.update(req.userId, req.params.id, req.body);
    res.json(t);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await service.remove(req.userId, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function importCsv(req, res, next) {
  try {
    const result = await service.importCsv(req.userId, req.body.rows);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { list, summary, create, update, remove, importCsv };
