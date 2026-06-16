const router = require('express').Router();
const ctrl = require('./cards.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['credito', 'debito', 'transporte']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  credit_limit: z.number().positive().nullable().optional(),
  cut_day: z.number().int().min(1).max(31).nullable().optional(),
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
});

const importSchema = z.object({
  rows: z.array(schema).min(1).max(100),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/export', ctrl.exportCsv);
router.post('/import', validate(importSchema), ctrl.importCsv);
router.post('/', validate(schema), ctrl.create);
router.get('/:id/summary', ctrl.summary);
router.put('/:id', validate(schema.partial()), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
