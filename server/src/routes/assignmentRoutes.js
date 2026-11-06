import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as assignments from '../controllers/assignmentController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import ApiError from '../utils/ApiError.js';

const router = Router();
const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 6, fieldSize: 24000 } });
const answer = z.object({ questionId: id, text: z.string().max(12000).optional().default(''), selectedOption: z.number().int().min(0).optional() });
const payload = z.object({ response: z.string().max(20000).optional().default(''), answers: z.array(answer).max(100).optional().default([]), links: z.array(z.string().url()).max(20).optional().default([]), draft: z.boolean().optional().default(false) });
const grading = z.object({ score: z.number().min(0).max(10000), feedback: z.string().trim().max(8000).optional().default(''), decision: z.enum(['graded', 'passed', 'failed', 'revision-requested']).optional().default('graded') });
export function parseForm(req, _res, next) {
  for (const field of ['answers', 'links']) {
    if (typeof req.body[field] !== 'string') continue;
    try { req.body[field] = JSON.parse(req.body[field]); }
    catch {
      return next(ApiError.badRequest(`Submission form contains invalid JSON in ${field}.`, [
        { path: field, message: 'Enter valid JSON.' },
      ]));
    }
  }
  if (typeof req.body.draft === 'string' && ['true', 'false'].includes(req.body.draft)) {
    req.body.draft = req.body.draft === 'true';
  }
  const parsed = payload.safeParse(req.body);
  if (!parsed.success) {
    return next(ApiError.badRequest('Submission form is invalid.', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))));
  }
  req.body = parsed.data;
  next();
}

router.use(requireAuth);
router.get('/submissions/:submissionId/files/:fileIndex', validate(z.object({ submissionId: id, fileIndex: z.string().regex(/^\d{1,2}$/) }), 'params'), assignments.downloadSubmissionFile);
router.get('/:id/submissions', validate(z.object({ id }), 'params'), assignments.listSubmissions);
router.delete('/:id', validate(z.object({ id }), 'params'), assignments.deleteAssignment);
router.post('/:id/submit', validate(z.object({ id }), 'params'), upload.array('files', 5), parseForm, assignments.submitAssignment);
router.post('/:id/draft', validate(z.object({ id }), 'params'), upload.array('files', 5), parseForm, (req, _res, next) => { req.body.draft = true; next(); }, assignments.submitAssignment);
router.post('/submissions/:submissionId/grade', validate(z.object({ submissionId: id }), 'params'), validate(grading), assignments.gradeSubmission);

export default router;
