const router = require('express').Router();
const ctrl = require('./analytics.controller');
const auth = require('../../middleware/auth');

router.use(auth);
router.get('/by-category', ctrl.byCategory);
router.get('/by-method', ctrl.byMethod);
router.get('/trend', ctrl.trend);
router.get('/cards-debt', ctrl.cardsDebt);
router.get('/monthly-comparison', ctrl.monthlyComparison);

module.exports = router;
