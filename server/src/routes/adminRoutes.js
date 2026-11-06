import { Router } from 'express';
import { z } from 'zod';
import * as admin from '../controllers/adminController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const settingsBody = z.object({
  bookCompletionThreshold: z.number().int().min(50).max(100).optional(),
  assessmentQuestionCount: z.number().int().min(1).max(50).optional(),
  assessmentPassMark: z.number().int().min(1).max(100).optional(),
  assessmentAttempts: z.number().int().min(1).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one setting.' });
const activityQuery = z.object({
  page: z.string().regex(/^\d{1,5}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
  action: z.string().trim().max(120).optional(),
  resourceType: z.string().trim().max(80).optional(),
});

router.use(requireAuth, requireAdmin);
router.get('/activity', validate(activityQuery, 'query'), admin.listActivity);
router.get('/settings', admin.getSettings);
router.patch('/settings', validate(settingsBody), admin.saveSettings);

export default router;
