const service = require('./analytics.service');

async function byCategory(req, res, next) {
  try { res.json(await service.byCategory(req.userId, req.query)); } catch (err) { next(err); }
}

async function byMethod(req, res, next) {
  try { res.json(await service.byMethod(req.userId, req.query)); } catch (err) { next(err); }
}

async function trend(req, res, next) {
  try { res.json(await service.trend(req.userId, req.query)); } catch (err) { next(err); }
}

async function cardsDebt(req, res, next) {
  try { res.json(await service.cardsDebt(req.userId)); } catch (err) { next(err); }
}

async function monthlyComparison(req, res, next) {
  try { res.json(await service.monthlyComparison(req.userId, req.query)); } catch (err) { next(err); }
}

module.exports = { byCategory, byMethod, trend, cardsDebt, monthlyComparison };
