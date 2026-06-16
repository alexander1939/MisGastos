const router = require('express').Router();
const ctrl = require('./transactions.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  amount: z.number().positive(),
  type: z.enum(['ingreso', 'gasto']),
  category: z.string().min(1).max(100),
  method: z.string().max(100).optional(),
  description: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const updateSchema = schema.partial().extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const rowSchema = schema;
const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(1000),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/account-balance', ctrl.accountBalance);
router.get('/export', ctrl.exportCsv);
router.post('/', validate(schema), ctrl.create);
router.post('/import', validate(importSchema), ctrl.importCsv);
router.put('/:id', validate(updateSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
