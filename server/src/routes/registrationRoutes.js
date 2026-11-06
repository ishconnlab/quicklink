import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as registrations from '../controllers/registrationController.js';
import { requireAuth, requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import config from '../config/env.js';

const router = Router();
const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const slug = z.string().regex(/^[A-Za-z0-9_-]{32,48}$/);
const slugParams = z.object({ slug });
const idParams = z.object({ formId: id });
const registrationParams = z.object({ formId: id, registrationId: id });
const registrationStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ENROLLED', 'INVITED', 'ATTENDED', 'COMPLETED']);
const fields = z.array(z.object({
  key: z.string().regex(/^custom_[a-z0-9_-]+$/).max(40),
  label: z.string().trim().min(1).max(80),
  placeholder: z.string().trim().max(120).optional().default(''),
  required: z.boolean().optional().default(false),
})).max(10).optional().default([]).refine((items) => new Set(items.map((item) => item.key)).size === items.length, 'Custom field keys must be unique.');
const formBody = z.object({
  classId: id,
  title: z.string().trim().max(160).optional().refine((value) => value === undefined || value.length === 0 || value.length >= 2, 'Title must contain at least 2 characters.'),
  description: z.string().trim().max(4000).optional().default(''),
  placeholders: z.object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(120).optional(),
    whatsapp: z.string().trim().max(120).optional(),
  }).optional().default({}),
  fields,
});
const registrationBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  whatsapp: z.string().trim().min(7).max(40),
  answers: z.record(z.string(), z.string().max(2000)).optional().default({}),
});
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 } });
const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, error: { message: 'Too many registration attempts. Please try again later.' } },
});

router.get('/public/:slug/image', validate(slugParams, 'params'), registrations.getPublicImage);
router.get('/public/:slug', validate(slugParams, 'params'), registrations.getPublicForm);
router.post('/public/:slug', submissionLimiter, validate(slugParams, 'params'), validate(registrationBody), registrations.submitRegistration);

router.use(requireAuth, requireTeacher);
router.get('/', registrations.listForms);
router.post('/', validate(formBody), registrations.createForm);
router.patch('/:formId', validate(idParams, 'params'), validate(z.object({ active: z.boolean() })), registrations.updateFormStatus);
router.post('/:formId/image', validate(idParams, 'params'), uploadImage.single('image'), registrations.uploadFormImage);
router.get('/:formId/entries', validate(idParams, 'params'), registrations.listRegistrations);
router.patch('/:formId/entries/:registrationId/status', validate(registrationParams, 'params'), validate(z.object({ status: registrationStatus, note: z.string().trim().max(1000).optional().default('') })), registrations.reviewRegistration);
router.post('/:formId/entries/:registrationId/enroll', validate(registrationParams, 'params'), registrations.enrollRegistrationStudent);
router.post('/:formId/entries/enroll', validate(idParams, 'params'), validate(z.object({ registrationIds: z.array(id).min(1).max(200) })), registrations.enrollSelectedRegistrations);
router.post('/:formId/entries/:registrationId/email', validate(registrationParams, 'params'), registrations.sendLiveClassEmail);
router.post('/:formId/entries/invite', validate(idParams, 'params'), validate(z.object({ registrationIds: z.array(id).max(500).optional().default([]) })), registrations.sendClassInvitations);

export default router;
