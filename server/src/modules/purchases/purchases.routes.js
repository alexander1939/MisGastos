const router = require('express').Router();
const ctrl = require('./purchases.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const schema = z.object({
  card_id: z.number().int().nullable().optional(),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  category: z.string().min(1).max(100),
  months: z.number().int().min(1).max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pay_month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  status: z.enum(['pendiente', 'pagado']).optional(),
});

const updateSchema = schema.partial().extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const statusSchema = z.object({
  status: z.enum(['pendiente', 'urgente', 'pagado', 'archivado']),
});

const payCardSchema = z.object({
  cardId: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  fromCardName: z.string().min(1).max(100),
});

const importSchema = z.object({
  rows: z.array(schema).min(1).max(1000),
});

router.use(auth);
router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/export', ctrl.exportCsv);
router.post('/', validate(schema), ctrl.create);
router.post('/import', validate(importSchema), ctrl.importCsv);
router.post('/pay-card', validate(payCardSchema), ctrl.payCard);
router.put('/:id', validate(updateSchema), ctrl.update);
router.put('/:id/status', validate(statusSchema), ctrl.updateStatus);
router.delete('/:id', ctrl.remove);

module.exports = router;
