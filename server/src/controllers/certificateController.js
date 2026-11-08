import { randomBytes } from 'node:crypto';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { AssessmentDraft } from '../models/AssessmentDraft.js';
import { ProjectSubmission } from '../models/ProjectSubmission.js';
import { evaluateCourseCompletion } from '../services/courseCompletion.js';
import { createCertificatePdf } from '../services/certificatePdf.js';
import { gradeAssessment, sanitizeAssessmentQuestions } from '../services/finalAssessment.js';
import { assertCanAttend } from '../services/classAccess.js';
import config from '../config/env.js';
import { isAdmin } from '../security/roles.js';

const COURSE_FIELDS = [
  'title', 'level', 'active', 'published', 'students', 'learningMaterials', 'completionRequirements',
  'certificationAssessmentEnabled', 'certificationQuestions', 'assessmentAttempts', 'assessmentPassMark',
  'assessmentLockdown', 'minimumAttendanceSessions', 'projectSubmission', 'payment', 'startsAt', 'createdAt',
].join(' ');

function certificateJson(certificate) {
  return {
    id: certificate._id.toString(),
    kind: certificate.kind || (certificate.book ? 'book' : 'course'),
    courseId: certificate.course?.toString() || null,
    bookId: certificate.book?.toString() || null,
    studentId: certificate.student?.toString() || null,
    code: certificate.code,
    studentName: certificate.studentName,
    courseTitle: certificate.courseTitle,
    level: certificate.level,
    completionDate: certificate.completionDate || certificate.issuedAt,
    issuedAt: certificate.issuedAt,
    issuedBy: certificate.issuedBy?.toString() || null,
    revoked: Boolean(certificate.revokedAt),
    revokedAt: certificate.revokedAt || null,
    revocationReason: certificate.revocationReason || '',
    reissueCount: certificate.reissueHistory?.length || 0,
    reissueHistory: (certificate.reissueHistory || []).map((item) => ({
      code: item.code,
      issuedAt: item.issuedAt,
      reason: item.reason || '',
    })),
    verificationPath: `/verify/${certificate.code}`,
    sharePath: `/api/certificates/share/${certificate.code}`,
    downloadPath: `/api/certificates/${certificate._id}.pdf`,
  };
}

async function registeredNamesFor(courseId, students) {
  const form = await TrainingRegistrationForm.findOne({ learningClass: courseId }).select('_id').lean();
  if (!form || students.length === 0) return new Map();
  const byEmail = await TrainingRegistration.find({
    form: form._id,
    email: { $in: students.map((student) => student.email.trim().toLowerCase()) },
  }).select('email name').lean();
  return new Map(byEmail.map((registration) => [registration.email, registration.name]));
}

async function findOrIssueCertificate(course, student, registeredName = student.name, issuedBy = null) {
  try {
    return await CourseCertificate.findOneAndUpdate(
      { student: student._id, course: course._id },
      {
        $setOnInsert: {
          code: randomBytes(24).toString('base64url'),
          student: student._id,
          kind: 'course',
          course: course._id,
          studentName: registeredName,
          courseTitle: course.title,
          level: course.level,
          completionDate: new Date(),
          issuedAt: new Date(),
          issuedBy,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return CourseCertificate.findOne({ student: student._id, course: course._id });
  }
}

async function assessmentState(course, studentId) {
  const attempts = await CertificationAssessmentAttempt.find({ student: studentId, course: course._id })
    .sort({ attemptNumber: 1 })
    .select('attemptNumber score passed submittedAt')
    .lean();
  const draft = await AssessmentDraft.findOne({ student: studentId, course: course._id }).lean();
  const passed = attempts.some((attempt) => attempt.passed);
  const maxAttempts = Math.max(1, Number(course.assessmentAttempts || 3));
  return {
    attempts,
    draft,
    passed,
    maxAttempts,
    attemptsUsed: attempts.length,
    attemptsRemaining: Math.max(0, maxAttempts - attempts.length),
  };
}

async function projectCompleteFor(course, studentId) {
  const settings = course.projectSubmission || {};
  if (!settings.enabled || !settings.required) return { required: false, complete: true };
  const submission = await ProjectSubmission.exists({ learningClass: course._id, student: studentId });
  return { required: true, complete: Boolean(submission) };
}

function projectLinkError(url, settings) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return 'Enter a valid project link, including https://.'; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return 'Project links must use http or https.';
  const isGithub = parsed.hostname === 'github.com' || parsed.hostname.endsWith('.github.com');
  if (isGithub && settings.allowGithub === false) return 'GitHub links are disabled for this training.';
  if (!isGithub && settings.allowOtherLinks === false) return 'Only GitHub project links are allowed for this training.';
  return null;
}

export const getCourseCompletion = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select(COURSE_FIELDS);
  if (!course) throw ApiError.notFound('Training not found.');
  if (!isAdmin(req.user) && !course.students.some((student) => student.toString() === req.user._id.toString())) throw ApiError.forbidden('Enroll in this training to view your completion requirements.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  res.json({ success: true, data: { courseId: course._id.toString(), ...state } });
});

export const issueCertificate = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only enrolled students can earn training certificates.');
  const course = await LearningClass.findById(req.params.id).select(COURSE_FIELDS);
  if (!course) throw ApiError.notFound('Training not found.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  if (!state.eligible) throw ApiError.conflict('Training requirements are not complete.', state.outstanding);
  const registeredNames = await registeredNamesFor(course._id, [req.user]);
  const certificate = await findOrIssueCertificate(course, req.user, registeredNames.get(req.user.email.toLowerCase()) || req.user.name);
  if (certificate.revokedAt) throw ApiError.conflict('This certificate was revoked. Contact the administrator for assistance.');
  res.status(201).json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const listMyCertificates = asyncHandler(async (req, res) => {
  const certificates = await CourseCertificate.find({ student: req.user._id }).sort({ issuedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { certificates: certificates.map(certificateJson) } });
});

export const listAllCertificates = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = {};
  if (req.query.status === 'revoked') filter.revokedAt = { $ne: null };
  if (req.query.status === 'valid') filter.revokedAt = null;
  if (req.query.courseId) filter.course = req.query.courseId;
  if (req.query.studentId) filter.student = req.query.studentId;
  if (req.query.search) {
    const search = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ studentName: search }, { courseTitle: search }, { code: search }];
  }
  const [certificates, total] = await Promise.all([
    CourseCertificate.find(filter).sort({ issuedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CourseCertificate.countDocuments(filter),
  ]);
  res.json({ success: true, data: { certificates: certificates.map(certificateJson), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

export const listCourseCertificates = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('title students');
  if (!course) throw ApiError.notFound('Training not found.');
  const certificates = await CourseCertificate.find({ course: course._id }).sort({ issuedAt: -1 }).limit(500).lean();
  res.json({ success: true, data: { certificates: certificates.map(certificateJson) } });
});

export const listCertificateCandidates = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select(COURSE_FIELDS);
  if (!course) throw ApiError.notFound('Training not found.');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const studentIds = course.students || [];
  const students = await User.find({ _id: { $in: studentIds }, role: 'student' })
    .select('name email isActive whatsapp country province')
    .sort({ name: 1, _id: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const registeredNames = await registeredNamesFor(course._id, students);
  const certificates = students.length ? await CourseCertificate.find({
    course: course._id,
    student: { $in: students.map((student) => student._id) },
  }).lean() : [];
  const certificateByStudent = new Map(certificates.map((certificate) => [certificate.student.toString(), certificate]));
  const candidates = await Promise.all(students.map(async (student) => {
    const completion = await evaluateCourseCompletion(course, student._id);
    const certificate = certificateByStudent.get(student._id.toString()) || null;
    const outstanding = [...completion.outstanding];
    if (!student.isActive) outstanding.unshift('Student account is inactive');
    if (certificate?.revokedAt) outstanding.unshift('Existing certificate is revoked');
    return {
      studentId: student._id.toString(),
      name: student.name,
      registeredName: registeredNames.get(student.email.toLowerCase()) || student.name,
      email: student.email,
      whatsapp: student.whatsapp || '',
      country: student.country || '',
      province: student.province || '',
      accountActive: student.isActive,
      eligible: completion.eligible && student.isActive && !certificate?.revokedAt,
      outstanding,
      certificate: certificate ? certificateJson(certificate) : null,
    };
  }));
  const total = studentIds.length;
  res.json({ success: true, data: { candidates, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), courseActive: course.active } });
});

export const issueCertificates = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select(COURSE_FIELDS);
  if (!course) throw ApiError.notFound('Training not found.');
  const ids = [...new Set(req.body.studentIds.map(String))];
  if (ids.length > 20) throw ApiError.badRequest('A certificate batch can contain at most 20 students.');
  const enrolled = new Set((course.students || []).map((student) => student.toString()));
  if (ids.some((id) => !enrolled.has(id))) throw ApiError.badRequest('Certificates can only be issued to students enrolled in this training.');
  const students = await User.find({ _id: { $in: ids }, role: 'student' }).select('name email isActive');
  if (students.length !== ids.length) throw ApiError.badRequest('One or more selected student accounts no longer exist.');
  const registeredNames = await registeredNamesFor(course._id, students);
  const results = await Promise.all(students.map(async (student) => {
    const completion = await evaluateCourseCompletion(course, student._id);
    const existing = await CourseCertificate.findOne({ course: course._id, student: student._id });
    const outstanding = [...completion.outstanding];
    if (!student.isActive) outstanding.unshift('Student account is inactive');
    if (existing?.revokedAt) outstanding.unshift('Existing certificate is revoked');
    if (!completion.eligible || !student.isActive || existing?.revokedAt) {
      return { studentId: student._id.toString(), name: student.name, issued: false, certificate: existing ? certificateJson(existing) : null, outstanding };
    }
    const certificate = await findOrIssueCertificate(course, student, registeredNames.get(student.email.toLowerCase()) || student.name, req.user._id);
    if (certificate.revokedAt) {
      return { studentId: student._id.toString(), name: student.name, issued: false, certificate: certificateJson(certificate), outstanding: ['Existing certificate is revoked'] };
    }
    return { studentId: student._id.toString(), name: student.name, issued: true, certificate: certificateJson(certificate), outstanding: [] };
  }));
  res.status(200).json({ success: true, data: { results, issuedCount: results.filter((result) => result.issued).length } });
});

export const updateCertificateName = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findById(req.params.id);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  if (certificate.revokedAt) throw ApiError.conflict('A revoked certificate cannot be edited.');
  certificate.studentName = req.body.studentName.trim();
  await certificate.save();
  res.json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const reissueCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findById(req.params.id);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  certificate.reissueHistory.push({
    code: certificate.code,
    issuedAt: certificate.issuedAt,
    issuedBy: certificate.issuedBy,
    reason: req.body.reason || '',
  });
  certificate.code = randomBytes(24).toString('base64url');
  certificate.issuedAt = new Date();
  certificate.issuedBy = req.user._id;
  certificate.revokedAt = null;
  certificate.revokedBy = null;
  certificate.revocationReason = '';
  await certificate.save();
  res.json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const getCertificationAssessmentSettings = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('certificationAssessmentEnabled certificationQuestions assessmentAttempts assessmentPassMark assessmentLockdown projectSubmission');
  if (!course) throw ApiError.notFound('Training not found.');
  res.json({
    success: true,
    data: {
      enabled: course.certificationAssessmentEnabled,
      questions: course.certificationQuestions || [],
      attempts: course.assessmentAttempts ?? 3,
      passMark: course.assessmentPassMark ?? 80,
      lockdown: course.assessmentLockdown !== false,
      projectSubmission: course.projectSubmission || {},
      attemptsStarted: await CertificationAssessmentAttempt.exists({ course: course._id }),
    },
  });
});

export const saveCertificationAssessmentSettings = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('certificationAssessmentEnabled certificationQuestions assessmentAttempts assessmentPassMark assessmentLockdown');
  if (!course) throw ApiError.notFound('Training not found.');
  const questionChanged = course.certificationAssessmentEnabled !== req.body.enabled
    || JSON.stringify(course.certificationQuestions.map((question) => question.toObject())) !== JSON.stringify(req.body.questions);
  if (questionChanged && await CertificationAssessmentAttempt.exists({ course: course._id })) {
    throw ApiError.conflict('The assessment questions cannot be changed after students have attempted it. You can still update attempts and the pass mark.');
  }
  course.certificationAssessmentEnabled = req.body.enabled;
  course.certificationQuestions = req.body.questions;
  if (req.body.attempts !== undefined) course.assessmentAttempts = req.body.attempts;
  if (req.body.passMark !== undefined) course.assessmentPassMark = req.body.passMark;
  if (req.body.lockdown !== undefined) course.assessmentLockdown = req.body.lockdown;
  await course.save();
  res.json({
    success: true,
    data: {
      enabled: course.certificationAssessmentEnabled,
      questionCount: course.certificationQuestions.length,
      attempts: course.assessmentAttempts,
      passMark: course.assessmentPassMark,
      lockdown: course.assessmentLockdown,
    },
  });
});

async function assessmentAccess(courseId, user) {
  const course = await LearningClass.findById(courseId).select(COURSE_FIELDS);
  if (!course) throw ApiError.notFound('Training not found.');
  if (user.role !== 'student') throw ApiError.forbidden('Certification assessments are for enrolled students.');
  if (!course.students.some((student) => student.toString() === user._id.toString())) {
    throw ApiError.forbidden('Enroll in this training to take its certification assessment.');
  }
  await assertCanAttend(course, user);
  return course;
}

function assessmentPayload(course, state, project, questions = []) {
  const configured = course.certificationQuestions?.length === 10;
  const canStart = Boolean(
    course.certificationAssessmentEnabled
    && configured
    && !state.passed
    && state.attemptsRemaining > 0
    && project.complete,
  );
  return {
    title: course.title,
    enabled: course.certificationAssessmentEnabled,
    configured,
    projectSubmissionRequired: project.required,
    projectSubmitted: project.complete,
    passed: state.passed,
    attemptsUsed: state.attemptsUsed,
    attemptsRemaining: state.attemptsRemaining,
    maxAttempts: state.maxAttempts,
    passMark: course.assessmentPassMark ?? 80,
    lockdown: course.assessmentLockdown !== false,
    latestAttempt: state.attempts.at(-1) ? {
      score: state.attempts.at(-1).score,
      passed: state.attempts.at(-1).passed,
      submittedAt: state.attempts.at(-1).submittedAt,
    } : null,
    canStart,
    draft: state.draft ? {
      answers: state.draft.answers,
      currentIndex: state.draft.currentIndex,
      fullscreenExitCount: state.draft.fullscreenExitCount,
      startedAt: state.draft.startedAt,
      lastSavedAt: state.draft.lastSavedAt,
    } : null,
    questions,
  };
}

export const getCertificationAssessment = asyncHandler(async (req, res) => {
  const course = await assessmentAccess(req.params.id, req.user);
  const state = await assessmentState(course, req.user._id);
  const project = await projectCompleteFor(course, req.user._id);
  const questions = state.draft ? sanitizeAssessmentQuestions(course.certificationQuestions || []) : [];
  res.json({ success: true, data: assessmentPayload(course, state, project, questions) });
});

export const startCertificationAssessment = asyncHandler(async (req, res) => {
  const course = await assessmentAccess(req.params.id, req.user);
  const state = await assessmentState(course, req.user._id);
  const project = await projectCompleteFor(course, req.user._id);
  if (!course.certificationAssessmentEnabled || course.certificationQuestions?.length !== 10) {
    throw ApiError.conflict('The administrator has not configured this training assessment.');
  }
  if (state.passed) throw ApiError.conflict('You have already passed this assessment.');
  if (state.attemptsRemaining <= 0) throw ApiError.conflict('No assessment attempts remain. Contact the administrator.');
  if (!project.complete) throw ApiError.conflict('Submit your project before taking the assessment.');
  let draft = await AssessmentDraft.findOne({ student: req.user._id, course: course._id });
  let created = false;
  if (!draft) {
    draft = await AssessmentDraft.create({ student: req.user._id, course: course._id, answers: [], currentIndex: 0 });
    created = true;
  }
  const payload = assessmentPayload(course, { ...state, draft: draft.toObject() }, project, sanitizeAssessmentQuestions(course.certificationQuestions));
  res.status(created ? 201 : 200).json({ success: true, data: payload });
});

export const saveAssessmentDraft = asyncHandler(async (req, res) => {
  const course = await assessmentAccess(req.params.id, req.user);
  const state = await assessmentState(course, req.user._id);
  if (state.passed) throw ApiError.conflict('You have already passed this assessment.');
  if (state.attemptsRemaining <= 0) throw ApiError.conflict('No assessment attempts remain.');
  if (!state.draft) throw ApiError.conflict('Start the assessment before saving progress.');
  const draft = await AssessmentDraft.findOneAndUpdate(
    { student: req.user._id, course: course._id },
    {
      $set: {
        answers: req.body.answers,
        currentIndex: req.body.currentIndex,
        fullscreenExitCount: req.body.fullscreenExitCount || 0,
        lastSavedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!draft) throw ApiError.conflict('Start the assessment before saving progress.');
  res.json({ success: true, data: { savedAt: draft.lastSavedAt, answeredCount: draft.answers.length, currentIndex: draft.currentIndex } });
});

export const submitCertificationAssessment = asyncHandler(async (req, res) => {
  const course = await assessmentAccess(req.params.id, req.user);
  if (!course.certificationAssessmentEnabled || course.certificationQuestions?.length !== 10) {
    throw ApiError.conflict('The administrator has not configured this training assessment.');
  }
  const project = await projectCompleteFor(course, req.user._id);
  if (!project.complete) throw ApiError.conflict('Submit your project before taking the assessment.');
  const state = await assessmentState(course, req.user._id);
  if (state.passed) throw ApiError.conflict('You have already passed this assessment.');
  if (state.attemptsRemaining <= 0) throw ApiError.conflict('No assessment attempts remain. Contact the administrator.');
  const attemptNumber = state.attemptsUsed + 1;
  const passMark = course.assessmentPassMark ?? 80;
  const { score, passed, correctCount } = gradeAssessment(course.certificationQuestions, req.body.answers, passMark);
  let attempt;
  try {
    attempt = await CertificationAssessmentAttempt.create({
      student: req.user._id,
      course: course._id,
      attemptNumber,
      answers: req.body.answers,
      score,
      passed,
    });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('An assessment attempt was submitted at the same time. Refresh the assessment status.');
    throw error;
  }
  await AssessmentDraft.deleteOne({ student: req.user._id, course: course._id });
  res.status(201).json({
    success: true,
    data: {
      score,
      correctCount,
      passed,
      attemptNumber,
      attemptsRemaining: Math.max(0, state.maxAttempts - attemptNumber),
      passMark,
    },
  });
});

export const getMyProjectSubmission = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('students projectSubmission');
  if (!course) throw ApiError.notFound('Training not found.');
  if (req.user.role !== 'student' || !course.students.some((student) => student.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Enroll in this training to submit its project.');
  }
  const submission = await ProjectSubmission.findOne({ learningClass: course._id, student: req.user._id }).lean();
  res.json({ success: true, data: { settings: course.projectSubmission || {}, submission: submission ? { ...submission, id: submission._id.toString() } : null } });
});

export const submitProject = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('students projectSubmission payment startsAt createdAt');
  if (!course) throw ApiError.notFound('Training not found.');
  if (req.user.role !== 'student' || !course.students.some((student) => student.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Enroll in this training to submit its project.');
  }
  await assertCanAttend(course, req.user);
  const settings = course.projectSubmission || {};
  if (!settings.enabled) throw ApiError.conflict('Project submission is not enabled for this training.');
  const linkError = projectLinkError(req.body.linkUrl, settings);
  if (linkError) throw ApiError.badRequest(linkError);
  const description = String(req.body.description || '').trim();
  if (settings.requireDescription && description.length < 10) throw ApiError.badRequest('Describe your project in at least 10 characters.');
  const existing = await ProjectSubmission.findOne({ learningClass: course._id, student: req.user._id });
  if (existing?.status === 'approved') throw ApiError.conflict('Your project has already been approved.');
  const submission = await ProjectSubmission.findOneAndUpdate(
    { learningClass: course._id, student: req.user._id },
    {
      $set: {
        linkUrl: req.body.linkUrl,
        description,
        status: 'submitted',
        feedback: '',
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  res.status(201).json({ success: true, data: { submission: { ...submission.toObject(), id: submission._id.toString() } } });
});

export const listProjectSubmissions = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('title students projectSubmission');
  if (!course) throw ApiError.notFound('Training not found.');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = { learningClass: course._id };
  if (req.query.status) filter.status = req.query.status;
  const [submissions, total] = await Promise.all([
    ProjectSubmission.find(filter).populate('student', 'name email whatsapp country province').sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProjectSubmission.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: {
      settings: course.projectSubmission || {},
      enrolledCount: (course.students || []).length,
      submissions: submissions.map((submission) => ({
        ...submission,
        id: submission._id.toString(),
        student: submission.student ? {
          id: submission.student._id.toString(),
          name: submission.student.name,
          email: submission.student.email,
          whatsapp: submission.student.whatsapp || '',
          country: submission.student.country || '',
          province: submission.student.province || '',
        } : null,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const reviewProjectSubmission = asyncHandler(async (req, res) => {
  const submission = await ProjectSubmission.findById(req.params.submissionId);
  if (!submission) throw ApiError.notFound('Project submission not found.');
  submission.status = req.body.status;
  submission.feedback = req.body.feedback || '';
  submission.reviewedAt = new Date();
  submission.reviewedBy = req.user._id;
  await submission.save();
  res.json({ success: true, data: { submission: { ...submission.toObject(), id: submission._id.toString() } } });
});

export const verifyCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findOne({ code: req.params.code }).lean();
  if (!certificate) return res.status(404).json({ success: true, data: { valid: false, status: 'not-found' } });
  res.json({
    success: true,
    data: {
      valid: !certificate.revokedAt,
      status: certificate.revokedAt ? 'revoked' : 'valid',
      studentName: certificate.studentName,
      courseTitle: certificate.courseTitle,
      level: certificate.level,
      completionDate: certificate.completionDate || certificate.issuedAt,
      issuedAt: certificate.issuedAt,
      certificateId: certificate.code,
      issuer: 'IshConnect',
      learningPortal: 'QuickLink Learning Portal',
      verificationPath: `/verify/${certificate.code}`,
      sharePath: `/api/certificates/share/${certificate.code}`,
    },
  });
});

export const shareCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findOne({ code: req.params.code }).lean();
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  const appUrl = config.mail.appUrl || config.corsOrigin[0];
  if (!appUrl) throw ApiError.conflict('The public application URL is not configured.');
  const verificationUrl = new URL(`/verify/${certificate.code}`, appUrl).toString();
  const apiUrl = config.publicApiUrl || `${req.protocol}://${req.get('host')}`;
  const shareUrl = new URL(`/api/certificates/share/${certificate.code}`, apiUrl).toString();
  const imageUrl = new URL('/SHCONNECT_Corporate_Seal-removeb.png', appUrl).toString();
  const status = certificate.revokedAt ? 'Revoked certificate' : 'Verified certificate';
  const title = `${status}: ${certificate.studentName} - ${certificate.courseTitle}`;
  const description = certificate.revokedAt
    ? 'This IshConnect certificate has been revoked. View its current verification status in the QuickLink Learning Portal.'
    : `${certificate.studentName} completed ${certificate.courseTitle} (${certificate.level}) through the QuickLink Learning Portal. Verify this IshConnect certificate online.`;
  const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="IshConnect - QuickLink Learning Portal"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(shareUrl)}"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:alt" content="IshConnect corporate seal"><meta name="twitter:card" content="summary"><meta http-equiv="refresh" content="0;url=${escapeHtml(verificationUrl)}"></head><body><p>Opening the <a href="${escapeHtml(verificationUrl)}">certificate verification page</a>...</p><script>window.location.replace(${JSON.stringify(verificationUrl)})</script></body></html>`);
});

export const revokeCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findById(req.params.id);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  if (!certificate.revokedAt) {
    certificate.revokedAt = new Date();
    certificate.revokedBy = req.user._id;
    certificate.revocationReason = req.body.reason;
    await certificate.save();
  }
  res.json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = /^[0-9a-fA-F]{24}$/.test(req.params.id)
    ? await CourseCertificate.findById(req.params.id)
    : await CourseCertificate.findOne({ code: req.params.id });
  if (!certificate || certificate.revokedAt) throw ApiError.notFound('Certificate is unavailable.');
  if (req.user.role !== 'admin' && certificate.student.toString() !== req.user._id.toString()) throw ApiError.forbidden('You cannot download another student certificate.');
  const appUrl = config.mail.appUrl || config.corsOrigin[0];
  if (!appUrl) throw ApiError.conflict('The public application URL is not configured.');
  const verificationUrl = new URL(`/verify/${certificate.code}`, appUrl).toString();
  const buffer = await createCertificatePdf(certificate, verificationUrl);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ishconnect-quicklink-certificate-${certificate.code}.pdf"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export default {
  getCourseCompletion,
  issueCertificate,
  listMyCertificates,
  listAllCertificates,
  listCourseCertificates,
  listCertificateCandidates,
  issueCertificates,
  updateCertificateName,
  reissueCertificate,
  getCertificationAssessmentSettings,
  saveCertificationAssessmentSettings,
  getCertificationAssessment,
  startCertificationAssessment,
  saveAssessmentDraft,
  submitCertificationAssessment,
  getMyProjectSubmission,
  submitProject,
  listProjectSubmissions,
  reviewProjectSubmission,
  verifyCertificate,
  shareCertificate,
  revokeCertificate,
  downloadCertificate,
};
