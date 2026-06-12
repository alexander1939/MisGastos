const router = require('express').Router();
const ctrl = require('./archive.controller');
const auth = require('../../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.get('/:monthKey', ctrl.getMonth);
router.post('/close-month', ctrl.closeMonth);
router.delete('/:monthKey', ctrl.remove);

module.exports = router;
