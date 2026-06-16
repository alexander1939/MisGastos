const router = require('express').Router();
const auth = require('../../middleware/auth');
const ctrl = require('./transfers.controller');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  from_card_id: z.number().int().positive().nullable().optional(),
  to_card_id: z.number().int().positive().nullable().optional(),
  amount: z.number().positive(),
  description: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['transfer', 'retiro']).optional(),
});

const importSchema = z.object({
  rows: z.array(schema).min(1).max(1000),
});

router.use(auth);
router.get('/',       ctrl.getAll);
router.get('/export', ctrl.exportCsv);
router.post('/import', validate(importSchema), ctrl.importCsv);
router.post('/',      validate(schema), ctrl.create);
router.delete('/:id', ctrl.del);

module.exports = router;
