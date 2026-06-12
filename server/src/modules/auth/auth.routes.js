const router = require('express').Router();
const ctrl = require('./auth.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const rateLimiter = require('../../middleware/rateLimiter');
const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  salary: z.number().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', validate(registerSchema), ctrl.register);
router.post('/login', rateLimiter({ max: 5, windowSec: 60 }), validate(loginSchema), ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/refresh', ctrl.refreshToken);
router.get('/me', auth, ctrl.me);
router.put('/me', auth, ctrl.updateMe);
router.delete('/me', auth, ctrl.deleteMe);

module.exports = router;
