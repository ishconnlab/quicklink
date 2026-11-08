import { Router } from 'express';
import { z } from 'zod';
import * as admin from '../controllers/adminController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const settingsBody = z.object({
  assessment: z.object({
    passMark: z.number().int().min(1).max(100).optional(),
    attempts: z.number().int().min(1).max(10).optional(),
    lockdown: z.boolean().optional(),
    minimumAttendanceSessions: z.number().int().min(0).max(100).optional(),
  }).optional(),
  payment: z.object({
    enabled: z.boolean().optional(),
    freeDays: z.number().int().min(0).max(60).optional(),
    amount: z.number().int().min(0).max(100000000).optional(),
    currency: z.string().trim().min(1).max(12).optional(),
    paymentCode: z.string().trim().min(1).max(40).optional(),
    paymentName: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().max(2000).optional(),
  }).optional(),
  certificates: z.object({
    issuer: z.string().trim().min(1).max(120).optional(),
    portalName: z.string().trim().min(1).max(120).optional(),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one setting.' });
const activityQuery = z.object({
  page: z.string().regex(/^\d{1,5}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
  action: z.string().trim().max(120).optional(),
  resourceType: z.string().trim().max(80).optional(),
});
const studentQuery = z.object({
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false']).optional(),
});
const enrollmentQuery = z.object({
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
  search: z.string().trim().max(120).optional(),
  classId: objectId.optional(),
  studentId: objectId.optional(),
  status: z.enum(['enrolled', 'cancelled']).optional(),
  paymentStatus: z.enum(['not_required', 'unpaid', 'pending', 'paid', 'rejected', 'waived']).optional(),
});
const paymentBody = z.object({
  status: z.enum(['pending', 'paid', 'waived', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

router.use(requireAuth, requireAdmin);
router.get('/dashboard', admin.getDashboard);
router.get('/activity', validate(activityQuery, 'query'), admin.listActivity);
router.get('/students', validate(studentQuery, 'query'), admin.listStudents);
router.get('/students/:id', validate(z.object({ id: objectId }), 'params'), admin.getStudentDetail);
router.get('/enrollments', validate(enrollmentQuery, 'query'), admin.listEnrollments);
router.patch('/enrollments/:id/payment', validate(z.object({ id: objectId }), 'params'), validate(paymentBody), admin.verifyPayment);
router.get('/settings', admin.getSettings);
router.patch('/settings', validate(settingsBody), admin.saveSettings);

export default router;
