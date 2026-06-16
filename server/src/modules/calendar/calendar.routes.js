const router = require('express').Router();
const ctrl = require('./calendar.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['tarjeta', 'quincena', 'pago', 'tarea']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().optional(),
  note: z.string().max(500).optional(),
  repeat: z.enum(['none', 'monthly', 'biweekly']).optional(),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/upcoming', ctrl.upcoming);
router.post('/', validate(schema), ctrl.create);
router.put('/:id', validate(schema.partial()), ctrl.update);
router.put('/:id/done', ctrl.toggleDone);
router.delete('/:id', ctrl.remove);

module.exports = router;
