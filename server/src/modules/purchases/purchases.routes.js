const router = require('express').Router();
const ctrl = require('./purchases.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  card_id: z.number().int().nullable().optional(),
  description: z.string().min(1),
  amount: z.number().positive(),
  category: z.string().min(1),
  months: z.number().int().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pay_month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/export', ctrl.exportCsv);
router.post('/', validate(schema), ctrl.create);
router.post('/import', ctrl.importCsv);
router.post('/pay-card', ctrl.payCard);
router.put('/:id', ctrl.update);
router.put('/:id/status', ctrl.updateStatus);
router.delete('/:id', ctrl.remove);

module.exports = router;
