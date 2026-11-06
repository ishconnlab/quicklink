import { Router } from 'express';
import { z } from 'zod';
import * as courses from '../controllers/classController.js';
import { requireAuth, requireAdmin, requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import multer from 'multer';
import * as certificates from '../controllers/certificateController.js';

const router = Router();
const uploadThumbnail = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 } });
const idParams = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });
const optionalLevel = z.preprocess((value) => value === '' ? undefined : value, z.enum(['L3', 'L4', 'L5', 'Bootcamp', 'Training']).optional());
const listQuery = z.object({
  level: optionalLevel,
  subject: z.string().trim().max(120).optional(),
  trade: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'title', 'level', 'popular']).optional(),
  enrolled: z.enum(['true', 'false']).optional(),
  manage: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const candidateQuery = z.object({
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const issueCertificatesBody = z.object({
  studentIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1).max(100),
});
const certificationQuestion = z.object({
  prompt: z.string().trim().min(1).max(1200),
  options: z.array(z.string().trim().min(1).max(500)).length(4),
  correctOption: z.number().int().min(0).max(3),
});
const certificationSettings = z.object({
  enabled: z.boolean(),
  questions: z.array(certificationQuestion).length(10).or(z.array(certificationQuestion).length(0)),
}).refine((value) => !value.enabled || value.questions.length === 10, { message: 'An enabled certification assessment must contain exactly 10 questions.' });
const certificationAnswers = z.object({
  answers: z.array(z.object({
    questionIndex: z.number().int().min(0).max(9),
    optionIndex: z.number().int().min(0).max(3),
  })).length(10).refine((answers) => new Set(answers.map((answer) => answer.questionIndex)).size === 10),
});

router.get('/:id/thumbnail', validate(idParams, 'params'), courses.getCourseThumbnail);
router.use(requireAuth);
router.get('/', validate(listQuery, 'query'), courses.listCourses);
router.post('/:id/thumbnail', requireTeacher, validate(idParams, 'params'), uploadThumbnail.single('thumbnail'), courses.updateCourseThumbnail);
router.get('/:id/completion', validate(idParams, 'params'), certificates.getCourseCompletion);
router.get('/:id/certification-assessment/settings', requireAdmin, validate(idParams, 'params'), certificates.getCertificationAssessmentSettings);
router.put('/:id/certification-assessment/settings', requireAdmin, validate(idParams, 'params'), validate(certificationSettings), certificates.saveCertificationAssessmentSettings);
router.get('/:id/certification-assessment', validate(idParams, 'params'), certificates.getCertificationAssessment);
router.post('/:id/certification-assessment', validate(idParams, 'params'), validate(certificationAnswers), certificates.submitCertificationAssessment);
router.get('/:id/certificates', validate(idParams, 'params'), certificates.listCourseCertificates);
router.get('/:id/certificate-candidates', requireAdmin, validate(idParams, 'params'), validate(candidateQuery, 'query'), certificates.listCertificateCandidates);
router.post('/:id/certificates/issue', requireAdmin, validate(idParams, 'params'), validate(issueCertificatesBody), certificates.issueCertificates);
router.post('/:id/certificate', validate(idParams, 'params'), certificates.issueCertificate);
router.get('/:id', validate(idParams, 'params'), courses.getCourse);
router.post('/:id/enroll', validate(idParams, 'params'), courses.enrollInCourse);

export default router;

