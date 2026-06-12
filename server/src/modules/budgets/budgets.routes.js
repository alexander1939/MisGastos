const router = require('express').Router();
const ctrl = require('./budgets.controller');
const auth = require('../../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.put('/', ctrl.upsert);
router.get('/status', ctrl.status);

module.exports = router;
