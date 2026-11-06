import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import ApiError from '../utils/ApiError.js';
import * as learning from '../controllers/learningController.js';
import multer from 'multer';
import config from '../config/env.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.learning.maxFileBytes, files: 1, fields: 2 } });
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 } });
router.use(requireAuth, (req, _res, next) => {
  if (!['admin', 'owner', 'teacher', 'student'].includes(req.user.role)) {
    return next(ApiError.forbidden('This account cannot access QuickLink Learning'));
  }
  next();
});
const idSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });
const progressSchema = z.object({
  currentPage: z.number().int().min(1).max(100000).optional(),
  totalPages: z.number().int().min(0).max(100000).optional(),
  positionType: z.enum(['page', 'slide', 'section', 'sheet', 'document']).optional(),
  positionIndex: z.number().int().min(0).max(100000).optional(),
  positionLabel: z.string().trim().max(240).optional(),
  totalUnits: z.number().int().min(0).max(100000).optional(),
  timeSpentSeconds: z.number().int().min(0).max(120).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  scrollPercent: z.number().min(0).max(100).optional(),
  completed: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);
const bookUpdateSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  level: z.enum(['L3', 'L4', 'L5']).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);
const assessmentQuestion = z.object({
  prompt: z.string().trim().min(1).max(1200),
  options: z.array(z.string().trim().min(1).max(500)).length(4),
  correctOption: z.number().int().min(0).max(3),
});
const assessmentSchema = z.object({ questions: z.array(assessmentQuestion).max(50) });
const assessmentAnswersSchema = z.object({
  answers: z.array(z.object({
    questionIndex: z.number().int().min(0).max(49),
    optionIndex: z.number().int().min(0).max(3),
  })).max(50).refine((answers) => new Set(answers.map((answer) => answer.questionIndex)).size === answers.length),
  violation: z.enum(['tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'screenshot_shortcut']).optional(),
});

router.get('/summary', learning.learningSummary);
router.post('/books/upload', requireAdmin, upload.single('file'), validate(z.object({ level: z.enum(['L3', 'L4', 'L5']), category: z.string().trim().min(1).max(120) })), learning.uploadBook);
router.get('/books', validate(z.object({ manage: z.enum(['true', 'false']).optional(), level: z.enum(['L3', 'L4', 'L5']).optional(), category: z.string().trim().max(120).optional(), format: z.string().regex(/^(pdf|doc|docx|txt|md|ppt|pptx|xls|xlsx)$/).optional(), search: z.string().max(120).optional(), limit: z.string().regex(/^\d{1,3}$/).optional() }), 'query'), learning.listBooks);
router.get('/books/:id/final-assessment', validate(idSchema, 'params'), learning.getFinalAssessment);
router.post('/books/:id/final-assessment', validate(idSchema, 'params'), validate(assessmentAnswersSchema), learning.submitFinalAssessment);
router.get('/books/:id/certificate', learning.getBookCertificate);
router.get('/books/:id/assessment-attempts', requireAdmin, validate(idSchema, 'params'), learning.listBookAssessmentAttempts);
router.get('/books/:id/assessment', requireAdmin, validate(idSchema, 'params'), learning.getBookAssessment);
router.put('/books/:id/assessment', requireAdmin, validate(idSchema, 'params'), validate(assessmentSchema), learning.saveBookAssessment);
router.get('/books/:id/preview', validate(idSchema, 'params'), learning.previewBook);
router.get('/books/:id/cover', validate(idSchema, 'params'), learning.streamBookCover);
router.get('/books/:id/file', validate(idSchema, 'params'), learning.streamBook);
router.put('/books/:id/progress', validate(idSchema, 'params'), validate(progressSchema), learning.saveProgress);
router.patch('/books/:id', requireAdmin, validate(idSchema, 'params'), validate(bookUpdateSchema), learning.updateBook);
router.post('/books/:id/cover', requireAdmin, validate(idSchema, 'params'), coverUpload.single('cover'), learning.uploadBookCover);
router.post('/books/:id/file', requireAdmin, validate(idSchema, 'params'), upload.single('file'), learning.replaceBook);
router.post('/books/:id/retry', requireAdmin, validate(idSchema, 'params'), learning.retryBook);
router.delete('/books/:id', requireAdmin, validate(idSchema, 'params'), learning.deleteBook);
export default router;


