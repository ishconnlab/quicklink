import { Router } from 'express';
import { z } from 'zod';
import * as classes from '../controllers/classController.js';
import * as notes from '../controllers/classNoteController.js';
import * as invitations from '../controllers/classInvitationController.js';
import * as attendanceReports from '../controllers/attendanceReportController.js';
import * as assignments from '../controllers/assignmentController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const idParams = z.object({ id: objectId });
const classIdParams = z.object({ classId: objectId });
const sessionParams = z.object({ sessionId: objectId });
const attendanceParams = z.object({ sessionId: objectId, studentId: objectId });
const invitationParams = z.object({ id: objectId, invitationId: objectId });
const invitationTokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/) });
const codeParams = z.object({ sessionCode: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) });
const assignmentQuestion = z.object({ prompt: z.string().trim().min(1).max(2000), type: z.enum(['text', 'single-choice']).default('text'), options: z.array(z.string().trim().max(500)).max(10).default([]), correctOption: z.number().int().min(0).optional(), points: z.number().min(0).max(1000).default(1) }).refine((question) => question.type !== 'single-choice' || (question.options.length >= 2 && question.correctOption !== undefined && question.correctOption < question.options.length));
const assignmentFields = {
  title: z.string().trim().min(2).max(180), instructions: z.string().trim().max(12000).optional().default(''),
  objectives: z.string().trim().max(4000).optional().default(''), toolsAndMaterials: z.string().trim().max(4000).optional().default(''),
  tasks: z.array(z.string().trim().min(1).max(2000)).max(50).optional().default([]),
  submissionRequirements: z.string().trim().max(4000).optional().default(''),
  submissionTypes: z.array(z.enum(['text', 'link', 'file'])).max(3).optional().default(['text']),
  rubric: z.array(z.object({ criterion: z.string().trim().min(1).max(500), points: z.number().min(0).max(10000) })).max(30).optional().default([]),
  type: z.enum(['assignment', 'practical', 'quiz']).default('practical'),
  questions: z.array(assignmentQuestion).max(50).optional().default([]),
  dueAt: z.string().datetime().nullable().optional(), maxPoints: z.number().min(1).max(10000).default(100),
  passMark: z.number().min(0).max(10000).default(50), allowLate: z.boolean().default(false),
  allowResubmission: z.boolean().default(true), published: z.boolean().default(false),
};
const pdfQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  studentId: objectId.optional(),
  sessionId: objectId.optional(),
});
const paymentSchema = z.object({
  enabled: z.boolean().optional(),
  freeDays: z.number().int().min(0).max(60).optional(),
  amount: z.number().int().min(0).max(100000000).optional(),
  currency: z.string().trim().min(1).max(12).optional(),
  paymentCode: z.string().trim().max(40).optional(),
  paymentName: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(2000).optional(),
}).refine((payment) => !payment.enabled || Boolean(payment.paymentCode?.trim() && payment.paymentName?.trim()), {
  message: 'Enter a payment code and account name when payment is enabled.',
  path: ['paymentCode'],
});
const projectSchema = z.object({
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  title: z.string().trim().max(180).optional(),
  instructions: z.string().trim().max(4000).optional(),
  allowGithub: z.boolean().optional(),
  allowOtherLinks: z.boolean().optional(),
  requireDescription: z.boolean().optional(),
});
const certificatePaymentSchema = z.object({
  enabled: z.boolean(), amount: z.number().int().min(0).max(100000000), currency: z.string().trim().min(1).max(12),
  paymentCode: z.string().trim().max(40), paymentName: z.string().trim().max(120), instructions: z.string().trim().max(2000).optional().default(''),
}).refine((value) => !value.enabled || (value.amount > 0 && Boolean(value.paymentCode && value.paymentName)), { message: 'Enter an amount above zero, payment code, and account name for paid certificates.' });
const completionSchema = z.object({
  requireReading: z.boolean().optional().default(false),
  requireTheory: z.boolean().optional().default(false),
  requirePractical: z.boolean().optional().default(false),
  requireAttendance: z.boolean().optional().default(false),
  minimumScore: z.number().min(0).max(100).optional().default(0),
});
const lessonQuestion = z.object({ prompt: z.string().trim().min(1).max(1200), options: z.array(z.string().trim().min(1).max(500)).length(4), correctOption: z.number().int().min(0).max(3), explanation: z.string().max(2000).optional().default('') });
const lesson = z.object({
  _id: objectId.optional(), title: z.string().trim().min(2).max(180), content: z.string().max(30000).optional().default(''),
  videoUrl: z.string().max(2000).optional().default(''),
  imageUrl: z.string().max(1000).optional().default(''),
  imagePublicId: z.string().max(255).optional().default(''),
  resources: z.array(z.object({ title: z.string().trim().max(180), url: z.string().url().max(2000) })).max(30).optional().default([]),
  code: z.object({ language: z.string().max(40).optional().default(''), source: z.string().max(20000).optional().default('') }).optional().default({}),
  codeBlocks: z.array(z.object({ language: z.string().max(40).optional().default(''), source: z.string().max(20000), explanation: z.string().max(2000).optional().default('') })).max(20).optional().default([]),
  knowledgeCheck: z.array(lessonQuestion).length(10).or(z.array(lessonQuestion).length(0)).optional().default([]),
  passMark: z.number().int().min(1).max(100).optional().default(70),
  assessmentAttempts: z.number().int().min(1).max(10).optional().default(3),
});
const modulesSchema = z.array(z.object({ _id: objectId.optional(), title: z.string().trim().min(2).max(180), lessons: z.array(lesson).max(100).default([]) })).max(100);
const classFields = {
  title: z.string().trim().min(2).max(160),
  subject: z.string().trim().min(2).max(120),
  trade: z.string().trim().max(120).optional().default(''),
  introduction: z.string().trim().max(500).optional().default(''),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180).optional(),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional(),
  courseDuration: z.string().trim().max(120).optional(),
  learningObjectives: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  prerequisites: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  language: z.string().trim().max(80).optional(),
  instructorName: z.string().trim().max(160).optional(),
  instructorBio: z.string().trim().max(3000).optional(),
  modules: modulesSchema.optional(),
  completionRequirements: completionSchema.optional(),
  course: z.string().trim().max(160).optional().default(''),
  level: z.enum(['L3', 'L4', 'L5', 'Bootcamp', 'Training']),
  description: z.string().trim().max(12000).optional().default(''),
  studentIds: z.array(objectId).max(300).default([]),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  enrollmentOpensAt: z.string().datetime().nullable().optional(),
  enrollmentClosesAt: z.string().datetime().nullable().optional(),
  schedule: z.string().trim().max(500).optional().default(''),
  durationMinutes: z.number().int().min(5).max(1440).optional().default(60),
  lateThresholdMinutes: z.number().int().min(0).max(240).optional().default(15),
  earlyThresholdPercent: z.number().int().min(1).max(100).optional().default(75),
  timezone: z.string().trim().min(1).max(80).optional().default('Africa/Johannesburg'),
  maxStudents: z.number().int().min(1).max(10000).optional().default(300),
  enrollmentOpen: z.boolean().optional().default(true),
  allowCancellation: z.boolean().optional().default(true),
  published: z.boolean().optional().default(true),
  payment: paymentSchema.optional(),
  certificatePayment: certificatePaymentSchema.optional(),
  projectSubmission: projectSchema.optional(),
  certificationAssessmentEnabled: z.boolean().optional(),
  assessmentAttempts: z.number().int().min(1).max(10).optional(),
  assessmentPassMark: z.number().int().min(1).max(100).optional(),
  assessmentLockdown: z.boolean().optional(),
  minimumAttendanceSessions: z.number().int().min(0).max(100).optional(),
};
const createClassSchema = z.object(classFields);
const updateClassSchema = z.object({
  ...Object.fromEntries(Object.entries(classFields).map(([key, value]) => [key, value.optional()])),
  active: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0);

router.use(requireAuth);
router.get('/:classId/assignments', validate(classIdParams, 'params'), assignments.listClassAssignments);
router.post('/:classId/assignments', requireAdmin, validate(classIdParams, 'params'), validate(z.object(assignmentFields).refine((body) => body.passMark <= body.maxPoints, { message: 'Pass mark cannot exceed the assignment maximum.' })), assignments.createAssignment);
router.get('/people/students', requireAdmin, classes.listPeople);
router.post('/invitations/:token/accept', validate(invitationTokenParams, 'params'), invitations.acceptInvitation);
router.get('/join/:sessionCode', validate(codeParams, 'params'), classes.joinByCode);
router.get('/sessions/:sessionId/report', validate(sessionParams, 'params'), classes.getSessionReport);
router.get('/sessions/:sessionId/notes', validate(sessionParams, 'params'), notes.getNotes);
router.put('/sessions/:sessionId/notes', requireAdmin, validate(sessionParams, 'params'), validate(z.object({ content: z.string().max(20000), revision: z.number().int().min(0) })), notes.saveNotes);
router.post('/sessions/:sessionId/livekit-token', validate(sessionParams, 'params'), classes.createLiveKitToken);
router.post('/sessions/:sessionId/end', requireAdmin, validate(sessionParams, 'params'), validate(z.object({ teacherNotes: z.string().trim().max(4000).optional().default('') })), classes.endSession);
router.patch('/sessions/:sessionId/attendance/:studentId', requireAdmin, validate(attendanceParams, 'params'), validate(z.object({ status: z.enum(['present', 'absent', 'late', 'early', 'excused']), reason: z.string().trim().min(3).max(1000) })), classes.correctAttendance);
router.delete('/sessions/:sessionId/attendance/:studentId', requireAdmin, validate(attendanceParams, 'params'), classes.removeAttendance);
router.get('/sessions/:sessionId', validate(sessionParams, 'params'), classes.getSession);
router.get('/', classes.listClasses);
router.get('/:id/report.pdf', requireAdmin, validate(idParams, 'params'), validate(pdfQuery, 'query'), attendanceReports.downloadAttendancePdf);
router.get('/:id/learning', validate(idParams, 'params'), classes.getLearningCourse);
router.get('/:id/learning/analytics', requireAdmin, validate(idParams, 'params'), classes.getLearningAnalytics);
router.put('/:id/learning/lessons/:lessonId/complete', validate(z.object({ id: objectId, lessonId: objectId }), 'params'), classes.completeLesson);
router.post('/:id/learning/lessons/:lessonId/assessment', validate(z.object({ id: objectId, lessonId: objectId }), 'params'), validate(z.object({ answers: z.array(z.object({ optionIndex: z.number().int().min(0).max(3) })).length(10) })), classes.submitLessonAssessment);
router.post('/:id/learning/lessons/:lessonId/events', validate(z.object({ id: objectId, lessonId: objectId }), 'params'), validate(z.object({ type: z.enum(['tab-hidden', 'window-blur', 'fullscreen-exit', 'copy', 'context-menu']) })), classes.logAssessmentEvent);
router.get('/:id/invitations', requireAdmin, validate(idParams, 'params'), invitations.listInvitations);
router.post('/:id/invitations', requireAdmin, validate(idParams, 'params'), validate(z.object({ studentIds: z.array(objectId).min(1).max(100) })), invitations.sendInvitations);
router.post('/:id/invitations/:invitationId/resend', requireAdmin, validate(invitationParams, 'params'), invitations.resendInvitation);
router.delete('/:id/invitations/:invitationId', requireAdmin, validate(invitationParams, 'params'), invitations.revokeInvitation);
router.get('/:id/sessions', validate(idParams, 'params'), classes.listClassSessions);
router.post('/', requireAdmin, validate(createClassSchema), classes.createClass);
router.patch('/:id', requireAdmin, validate(idParams, 'params'), validate(updateClassSchema), classes.updateClass);
router.delete('/:id/permanent', requireAdmin, validate(idParams, 'params'), classes.permanentlyDeleteClass);
router.delete('/:id', requireAdmin, validate(idParams, 'params'), classes.archiveClass);
router.get('/:id', validate(idParams, 'params'), classes.getClass);
router.post('/:id/sessions', requireAdmin, validate(idParams, 'params'), validate(z.object({ title: z.string().trim().max(180).optional().default('') })), classes.startSession);

export default router;
