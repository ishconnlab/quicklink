import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema, registerSchema, changePasswordSchema } from '../utils/validators.js';
import config from '../config/env.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: {
    success: false,
    error: { message: 'Too many login attempts, please try again later.' },
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: {
    success: false,
    error: { message: 'Too many registration attempts, please try again later.' },
  },
});

router.post('/register', registerLimiter, validate(registerSchema), auth.register);
router.post('/login', loginLimiter, validate(loginSchema), auth.login);
router.get('/me', requireAuth, auth.me);
router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  auth.changePassword
);

export default router;
