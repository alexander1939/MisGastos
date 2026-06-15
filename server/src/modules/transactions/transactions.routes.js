const router = require('express').Router();
const ctrl = require('./transactions.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  amount: z.number().positive(),
  type: z.enum(['ingreso', 'gasto']),
  category: z.string().min(1),
  method: z.string().optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/account-balance', ctrl.accountBalance);
router.get('/export', ctrl.exportCsv);
router.post('/', validate(schema), ctrl.create);
router.post('/import', ctrl.importCsv);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
