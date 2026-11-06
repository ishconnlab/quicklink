import { randomBytes } from 'node:crypto';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { evaluateCourseCompletion } from '../services/courseCompletion.js';
import { createCertificatePdf } from '../services/certificatePdf.js';
import { gradeAssessment, sanitizeAssessmentQuestions } from '../services/finalAssessment.js';
import config from '../config/env.js';

function certificateJson(certificate) {
  return {
    id: certificate._id.toString(),
    kind: certificate.kind || (certificate.book ? 'book' : 'course'),
    courseId: certificate.course?.toString() || null,
    bookId: certificate.book?.toString() || null,
    code: certificate.code,
    studentName: certificate.studentName,
    courseTitle: certificate.courseTitle,
    level: certificate.level,
    issuedAt: certificate.issuedAt,
    revoked: Boolean(certificate.revokedAt),
    verificationPath: `/verify/${certificate.code}`,
    sharePath: `/api/certificates/share/${certificate.code}`,
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

async function findOrIssueCertificate(course, student, registeredName = student.name) {
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
          issuedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return CourseCertificate.findOne({ student: student._id, course: course._id });
  }
}

async function requiredAssignmentsComplete(course, studentId) {
  const assignments = await Assignment.find({ learningClass: course._id, published: true })
    .select('passMark')
    .lean();
  if (!assignments.length) return true;
  const submissions = await AssignmentSubmission.find({
    assignment: { $in: assignments.map((assignment) => assignment._id) },
    student: studentId,
  }).sort({ attempt: -1 }).select('assignment status score').lean();
  const latest = new Map();
  for (const submission of submissions) {
    if (!latest.has(submission.assignment.toString())) latest.set(submission.assignment.toString(), submission);
  }
  return assignments.every((assignment) => {
    const submission = latest.get(assignment._id.toString());
    return Boolean(submission && (
      submission.status === 'passed'
      || (submission.score !== null && submission.score >= assignment.passMark)
    ));
  });
}

export const getCourseCompletion = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Course not found.');
  if (req.user.role !== 'admin' && !course.students.some((student) => student.toString() === req.user._id.toString())) throw ApiError.forbidden('Enroll in this course to view your completion requirements.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  res.json({ success: true, data: { courseId: course._id.toString(), ...state } });
});

export const issueCertificate = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only enrolled students can earn course certificates.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Course not found.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  if (!state.eligible) throw ApiError.conflict('Course requirements are not complete.', state.outstanding);
  const registeredNames = await registeredNamesFor(course._id, [req.user]);
  const certificate = await findOrIssueCertificate(course, req.user, registeredNames.get(req.user.email.toLowerCase()) || req.user.name);
  if (certificate.revokedAt) throw ApiError.conflict('This certificate was revoked. Contact the administrator for assistance.');
  res.status(201).json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const listMyCertificates = asyncHandler(async (req, res) => {
  const certificates = await CourseCertificate.find({ student: req.user._id }).sort({ issuedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { certificates: certificates.map(certificateJson) } });
});

export const listCourseCertificates = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('title teacher teachers students');
  if (!course) throw ApiError.notFound('Course not found.');
  const teacherIds = [course.teacher, ...(course.teachers || [])].map((id) => id.toString());
  if (req.user.role !== 'admin' && !teacherIds.includes(req.user._id.toString())) throw ApiError.forbidden('Only the assigned teacher or admin can view course certificates.');
  const certificates = await CourseCertificate.find({ course: course._id }).sort({ issuedAt: -1 }).limit(500).lean();
  res.json({ success: true, data: { certificates: certificates.map((certificate) => ({ ...certificateJson(certificate), studentId: certificate.student.toString(), revokedAt: certificate.revokedAt || null, revocationReason: certificate.revocationReason || '' })) } });
});

export const listCertificateCandidates = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw ApiError.forbidden('Only administrators can manage course certificates.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Course not found.');

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const studentIds = course.students || [];
  const students = await User.find({ _id: { $in: studentIds }, role: 'student' })
    .select('name email isActive')
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
      accountActive: student.isActive,
      eligible: completion.eligible && student.isActive && !certificate?.revokedAt,
      outstanding,
      certificate: certificate ? { ...certificateJson(certificate), revokedAt: certificate.revokedAt || null } : null,
    };
  }));
  const total = studentIds.length;
  res.json({ success: true, data: { candidates, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), courseActive: course.active } });
});

export const issueCertificates = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw ApiError.forbidden('Only administrators can issue certificates for students.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Course not found.');

  const ids = [...new Set(req.body.studentIds.map(String))];
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
    const certificate = await findOrIssueCertificate(course, student, registeredNames.get(student.email.toLowerCase()) || student.name);
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

export const getCertificationAssessmentSettings = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Training not found.');
  res.json({
    success: true,
    data: {
      enabled: course.certificationAssessmentEnabled,
      questions: course.certificationQuestions || [],
      attemptsStarted: await CertificationAssessmentAttempt.exists({ course: course._id }),
    },
  });
});

export const saveCertificationAssessmentSettings = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('certificationAssessmentEnabled certificationQuestions');
  if (!course) throw ApiError.notFound('Training not found.');
  const changed = course.certificationAssessmentEnabled !== req.body.enabled
    || JSON.stringify(course.certificationQuestions.map((question) => question.toObject())) !== JSON.stringify(req.body.questions);
  if (changed && await CertificationAssessmentAttempt.exists({ course: course._id })) {
    throw ApiError.conflict('This certification assessment cannot be changed after students have attempted it.');
  }
  course.certificationAssessmentEnabled = req.body.enabled;
  course.certificationQuestions = req.body.questions;
  await course.save();
  res.json({ success: true, data: { enabled: course.certificationAssessmentEnabled, questionCount: course.certificationQuestions.length } });
});

export const getCertificationAssessment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Certification assessments are for enrolled students.');
  const course = await LearningClass.findById(req.params.id)
    .select('title students certificationAssessmentEnabled certificationQuestions completionRequirements')
    .lean();
  if (!course) throw ApiError.notFound('Training not found.');
  if (!course.students.some((student) => student.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Enroll in this training to take its certification assessment.');
  }
  const attempts = await CertificationAssessmentAttempt.find({ student: req.user._id, course: course._id })
    .sort({ attemptNumber: 1 })
    .select('attemptNumber score passed submittedAt')
    .lean();
  const configured = course.certificationQuestions?.length === 10;
  const passed = attempts.some((attempt) => attempt.passed);
  const attemptsRemaining = Math.max(0, 3 - attempts.length);
  const assignmentsComplete = await requiredAssignmentsComplete(course, req.user._id);
  const canStart = course.certificationAssessmentEnabled && configured && assignmentsComplete && !passed && attemptsRemaining > 0;
  res.json({
    success: true,
    data: {
      title: course.title,
      enabled: course.certificationAssessmentEnabled,
      configured,
      assignmentsComplete,
      passed,
      attemptsUsed: attempts.length,
      attemptsRemaining,
      latestAttempt: attempts.at(-1) ? {
        score: attempts.at(-1).score,
        passed: attempts.at(-1).passed,
        submittedAt: attempts.at(-1).submittedAt,
      } : null,
      questions: canStart ? sanitizeAssessmentQuestions(course.certificationQuestions) : [],
    },
  });
});

export const submitCertificationAssessment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Certification assessments are for enrolled students.');
  const course = await LearningClass.findById(req.params.id)
    .select('students certificationAssessmentEnabled certificationQuestions completionRequirements');
  if (!course) throw ApiError.notFound('Training not found.');
  if (!course.students.some((student) => student.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Enroll in this training to take its certification assessment.');
  }
  if (!course.certificationAssessmentEnabled || course.certificationQuestions?.length !== 10) {
    throw ApiError.conflict('The administrator has not configured this trainingâ€™s 10-question certification assessment.');
  }
  if (!await requiredAssignmentsComplete(course, req.user._id)) {
    throw ApiError.conflict('Complete all required theory and practical assignments before taking the certification assessment.');
  }
  const attempts = await CertificationAssessmentAttempt.find({ student: req.user._id, course: course._id })
    .sort({ attemptNumber: 1 })
    .select('attemptNumber passed')
    .lean();
  if (attempts.some((attempt) => attempt.passed)) throw ApiError.conflict('You have already passed this certification assessment.');
  const attemptNumber = attempts.length + 1;
  if (attemptNumber > 3) throw ApiError.conflict('No assessment attempts remain. Contact the administrator.');
  const { score, passed } = gradeAssessment(course.certificationQuestions, req.body.answers);
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
  res.status(201).json({
    success: true,
    data: {
      score,
      passed,
      attemptNumber: attempt.attemptNumber,
      attemptsRemaining: Math.max(0, 3 - attemptNumber),
    },
  });
});

export const verifyCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findOne({ code: req.params.code }).lean();
  if (!certificate) return res.status(404).json({ success: true, data: { valid: false, status: 'not-found' } });
  res.json({ success: true, data: { valid: !certificate.revokedAt, status: certificate.revokedAt ? 'revoked' : 'valid', studentName: certificate.studentName, courseTitle: certificate.courseTitle, level: certificate.level, issuedAt: certificate.issuedAt, certificateId: certificate.code, issuer: 'IshConnect', learningPortal: 'QuickLink Learning Portal', verificationPath: `/verify/${certificate.code}`, sharePath: `/api/certificates/share/${certificate.code}` } });
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
  const title = `${status}: ${certificate.studentName} â€” ${certificate.courseTitle}`;
  const description = certificate.revokedAt
    ? 'This IshConnect certificate has been revoked. View its current verification status in the QuickLink Learning Portal.'
    : `${certificate.studentName} completed ${certificate.courseTitle} (${certificate.level}) through the QuickLink Learning Portal. Verify this IshConnect certificate online.`;
  const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="IshConnect Â· QuickLink Learning Portal"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(shareUrl)}"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:alt" content="IshConnect corporate seal"><meta name="twitter:card" content="summary"><meta http-equiv="refresh" content="0;url=${escapeHtml(verificationUrl)}"></head><body><p>Opening the <a href="${escapeHtml(verificationUrl)}">certificate verification page</a>â€¦</p><script>window.location.replace(${JSON.stringify(verificationUrl)})</script></body></html>`);
});

export const revokeCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findById(req.params.id);
  if (!certificate) throw ApiError.notFound('Certificate not found.');
  if (!certificate.revokedAt) {
    certificate.revokedAt = new Date(); certificate.revokedBy = req.user._id; certificate.revocationReason = req.body.reason;
    await certificate.save();
  }
  res.json({ success: true, data: { certificate: certificateJson(certificate) } });
});

export const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findById(req.params.id);
  if (!certificate || certificate.revokedAt) throw ApiError.notFound('Certificate is unavailable.');
  if (req.user.role !== 'admin' && certificate.student.toString() !== req.user._id.toString()) throw ApiError.forbidden('You cannot download another studentâ€™s certificate.');
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
  listCourseCertificates,
  listCertificateCandidates,
  issueCertificates,
  updateCertificateName,
  getCertificationAssessmentSettings,
  saveCertificationAssessmentSettings,
  getCertificationAssessment,
  submitCertificationAssessment,
  verifyCertificate,
  shareCertificate,
  revokeCertificate,
  downloadCertificate,
};

