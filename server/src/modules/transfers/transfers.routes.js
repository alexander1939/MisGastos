const router = require('express').Router();
const auth = require('../../middleware/auth');
const ctrl = require('./transfers.controller');

router.use(auth);
router.get('/',       ctrl.getAll);
router.get('/export', ctrl.exportCsv);
router.post('/import', ctrl.importCsv);
router.post('/',      ctrl.create);
router.delete('/:id', ctrl.del);

module.exports = router;
