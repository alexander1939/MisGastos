const router = require('express').Router();
const ctrl = require('./cards.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(['credito', 'debito', 'transporte']),
  color: z.string().optional(),
  credit_limit: z.number().nullable().optional(),
  cut_day: z.number().int().min(1).max(31).nullable().optional(),
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
});

router.use(auth);
router.get('/', ctrl.list);
router.post('/', validate(schema), ctrl.create);
router.get('/:id/summary', ctrl.summary);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
