import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import * as auth from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema, registerSchema, changePasswordSchema, updateProfileSchema } from '../utils/validators.js';
import config from '../config/env.js';

const router = Router();
const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, error: { message: 'Too many login attempts, please try again later.' } },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, error: { message: 'Too many registration attempts. Please try again later.' } },
});

router.post('/register', registerLimiter, validate(registerSchema), auth.register);
router.post('/login', loginLimiter, validate(loginSchema), auth.login);
router.get('/me', requireAuth, auth.me);
router.patch('/profile', requireAuth, validate(updateProfileSchema), auth.updateProfile);
router.post('/profile/image', requireAuth, uploadProfileImage.single('image'), auth.updateProfileImage);
router.post('/change-password', requireAuth, validate(changePasswordSchema), auth.changePassword);
router.post('/logout', requireAuth, auth.logout);
export default router;
