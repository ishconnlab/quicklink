import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as courses from '../controllers/classController.js';
import * as certificates from '../controllers/certificateController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const uploadThumbnail = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 } });
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const idParams = z.object({ id: objectId });
const projectParams = z.object({ id: objectId, submissionId: objectId });
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
const projectListQuery = z.object({
  status: z.enum(['submitted', 'approved', 'changes_requested']).optional(),
  page: z.string().regex(/^\d{1,4}$/).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
});
const issueCertificatesBody = z.object({
  studentIds: z.array(objectId).min(1).max(20),
});
const certificationQuestion = z.object({
  prompt: z.string().trim().min(1).max(1200),
  options: z.array(z.string().trim().min(1).max(500)).length(4),
  correctOption: z.number().int().min(0).max(3),
});
const certificationSettings = z.object({
  enabled: z.boolean(),
  questions: z.array(certificationQuestion).length(10).or(z.array(certificationQuestion).length(0)),
  attempts: z.number().int().min(1).max(10).optional(),
  passMark: z.number().int().min(1).max(100).optional(),
  lockdown: z.boolean().optional(),
}).refine((value) => !value.enabled || value.questions.length === 10, { message: 'An enabled assessment must contain exactly 10 questions.' });
const answer = z.object({
  questionIndex: z.number().int().min(0).max(9),
  optionIndex: z.number().int().min(0).max(3),
});
const certificationAnswers = z.object({
  answers: z.array(answer).length(10).refine((answers) => new Set(answers.map((item) => item.questionIndex)).size === 10),
});
const assessmentDraft = z.object({
  answers: z.array(answer).max(10).refine((answers) => new Set(answers.map((item) => item.questionIndex)).size === answers.length),
  currentIndex: z.number().int().min(0).max(9),
  fullscreenExitCount: z.number().int().min(0).max(1000).optional(),
});
const projectSubmissionBody = z.object({
  linkUrl: z.string().trim().min(5).max(2000),
  description: z.string().trim().max(4000).optional().default(''),
});
const projectReviewBody = z.object({
  status: z.enum(['approved', 'changes_requested']),
  feedback: z.string().trim().max(2000).optional().default(''),
});
const paymentReferenceBody = z.object({
  reference: z.string().trim().min(3).max(200),
  note: z.string().trim().max(1000).optional().default(''),
});

router.get('/:id/thumbnail', validate(idParams, 'params'), courses.getCourseThumbnail);
router.use(requireAuth);
router.get('/', validate(listQuery, 'query'), courses.listCourses);
router.post('/:id/thumbnail', requireAdmin, validate(idParams, 'params'), uploadThumbnail.single('thumbnail'), courses.updateCourseThumbnail);
router.post('/:id/modules/:moduleId/lessons/:lessonId/image', requireAdmin, validate(z.object({ id: objectId, moduleId: objectId, lessonId: objectId }), 'params'), uploadThumbnail.single('image'), courses.uploadLessonImage);
router.get('/:id/completion', validate(idParams, 'params'), certificates.getCourseCompletion);
router.get('/:id/certification-assessment/settings', requireAdmin, validate(idParams, 'params'), certificates.getCertificationAssessmentSettings);
router.put('/:id/certification-assessment/settings', requireAdmin, validate(idParams, 'params'), validate(certificationSettings), certificates.saveCertificationAssessmentSettings);
router.get('/:id/certification-assessment', validate(idParams, 'params'), certificates.getCertificationAssessment);
router.post('/:id/certification-assessment/start', validate(idParams, 'params'), certificates.startCertificationAssessment);
router.put('/:id/certification-assessment/draft', validate(idParams, 'params'), validate(assessmentDraft), certificates.saveAssessmentDraft);
router.post('/:id/certification-assessment', validate(idParams, 'params'), validate(certificationAnswers), certificates.submitCertificationAssessment);
router.get('/:id/project-submission', validate(idParams, 'params'), certificates.getMyProjectSubmission);
router.post('/:id/project-submission', validate(idParams, 'params'), validate(projectSubmissionBody), certificates.submitProject);
router.get('/:id/project-submissions', requireAdmin, validate(idParams, 'params'), validate(projectListQuery, 'query'), certificates.listProjectSubmissions);
router.patch('/:id/project-submissions/:submissionId', requireAdmin, validate(projectParams, 'params'), validate(projectReviewBody), certificates.reviewProjectSubmission);
router.get('/:id/certificates', requireAdmin, validate(idParams, 'params'), certificates.listCourseCertificates);
router.get('/:id/certificate-candidates', requireAdmin, validate(idParams, 'params'), validate(candidateQuery, 'query'), certificates.listCertificateCandidates);
router.post('/:id/certificates/issue', requireAdmin, validate(idParams, 'params'), validate(issueCertificatesBody), certificates.issueCertificates);
router.post('/:id/certificate', validate(idParams, 'params'), certificates.issueCertificate);
router.post('/:id/payment-reference', validate(idParams, 'params'), validate(paymentReferenceBody), courses.submitPaymentReference);
router.delete('/:id/enroll', validate(idParams, 'params'), courses.cancelEnrollment);
router.post('/:id/enroll', validate(idParams, 'params'), courses.enrollInCourse);
router.get('/:id', validate(idParams, 'params'), courses.getCourse);

export default router;
