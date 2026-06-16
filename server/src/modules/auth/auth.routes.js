const router = require('express').Router();
const ctrl = require('./auth.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const rateLimiter = require('../../middleware/rateLimiter');
const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(100),
  salary: z.number().min(0).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  salary: z.number().min(0).optional(),
  password: z.string().min(6).max(100).optional(),
});

router.post('/register', validate(registerSchema), ctrl.register);
router.post('/login', rateLimiter({ max: 5, windowSec: 60 }), validate(loginSchema), ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/refresh', ctrl.refreshToken);
router.get('/me', auth, ctrl.me);
router.put('/me', auth, validate(updateMeSchema), ctrl.updateMe);
router.delete('/me', auth, ctrl.deleteMe);

module.exports = router;
