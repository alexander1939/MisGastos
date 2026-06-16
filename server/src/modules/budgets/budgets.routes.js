const router = require('express').Router();
const ctrl = require('./budgets.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const upsertSchema = z.object({
  items: z.array(z.object({
    category: z.string().min(1).max(100),
    amount: z.number().positive(),
    period: z.enum(['mes', 'semana']).optional(),
  })).min(1).max(50),
});

router.use(auth);
router.get('/', ctrl.list);
router.put('/', validate(upsertSchema), ctrl.upsert);
router.get('/status', ctrl.status);

module.exports = router;
