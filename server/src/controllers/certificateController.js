import { randomBytes } from 'node:crypto';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { evaluateCourseCompletion } from '../services/courseCompletion.js';
import { createCertificatePdf } from '../services/certificatePdf.js';
import config from '../config/env.js';

function certificateJson(certificate) {
  return {
    id: certificate._id.toString(),
    courseId: certificate.course.toString(),
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

async function findOrIssueCertificate(course, student) {
  try {
    return await CourseCertificate.findOneAndUpdate(
      { student: student._id, course: course._id },
      {
        $setOnInsert: {
          code: randomBytes(24).toString('base64url'),
          student: student._id,
          course: course._id,
          studentName: student.name,
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

export const getCourseCompletion = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements');
  if (!course) throw ApiError.notFound('Course not found.');
  if (req.user.role !== 'owner' && !course.students.some((student) => student.toString() === req.user._id.toString())) throw ApiError.forbidden('Enroll in this course to view your completion requirements.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  res.json({ success: true, data: { courseId: course._id.toString(), ...state } });
});

export const issueCertificate = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only enrolled students can earn course certificates.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements');
  if (!course) throw ApiError.notFound('Course not found.');
  const state = await evaluateCourseCompletion(course, req.user._id);
  if (!state.eligible) throw ApiError.conflict('Course requirements are not complete.', state.outstanding);
  const certificate = await findOrIssueCertificate(course, req.user);
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
  if (req.user.role !== 'owner' && !teacherIds.includes(req.user._id.toString())) throw ApiError.forbidden('Only the assigned teacher or admin can view course certificates.');
  const certificates = await CourseCertificate.find({ course: course._id }).sort({ issuedAt: -1 }).limit(500).lean();
  res.json({ success: true, data: { certificates: certificates.map((certificate) => ({ ...certificateJson(certificate), studentId: certificate.student.toString(), revokedAt: certificate.revokedAt || null, revocationReason: certificate.revocationReason || '' })) } });
});

export const listCertificateCandidates = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') throw ApiError.forbidden('Only administrators can manage course certificates.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements');
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
  if (req.user.role !== 'owner') throw ApiError.forbidden('Only administrators can issue certificates for students.');
  const course = await LearningClass.findById(req.params.id).select('title level active students learningMaterials completionRequirements');
  if (!course) throw ApiError.notFound('Course not found.');

  const ids = [...new Set(req.body.studentIds.map(String))];
  const enrolled = new Set((course.students || []).map((student) => student.toString()));
  if (ids.some((id) => !enrolled.has(id))) throw ApiError.badRequest('Certificates can only be issued to students enrolled in this training.');

  const students = await User.find({ _id: { $in: ids }, role: 'student' }).select('name email isActive');
  if (students.length !== ids.length) throw ApiError.badRequest('One or more selected student accounts no longer exist.');
  const results = await Promise.all(students.map(async (student) => {
    const completion = await evaluateCourseCompletion(course, student._id);
    const existing = await CourseCertificate.findOne({ course: course._id, student: student._id });
    const outstanding = [...completion.outstanding];
    if (!student.isActive) outstanding.unshift('Student account is inactive');
    if (existing?.revokedAt) outstanding.unshift('Existing certificate is revoked');
    if (!completion.eligible || !student.isActive || existing?.revokedAt) {
      return { studentId: student._id.toString(), name: student.name, issued: false, certificate: existing ? certificateJson(existing) : null, outstanding };
    }
    const certificate = await findOrIssueCertificate(course, student);
    if (certificate.revokedAt) {
      return { studentId: student._id.toString(), name: student.name, issued: false, certificate: certificateJson(certificate), outstanding: ['Existing certificate is revoked'] };
    }
    return { studentId: student._id.toString(), name: student.name, issued: true, certificate: certificateJson(certificate), outstanding: [] };
  }));
  res.status(200).json({ success: true, data: { results, issuedCount: results.filter((result) => result.issued).length } });
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
  const title = `${status}: ${certificate.studentName} — ${certificate.courseTitle}`;
  const description = certificate.revokedAt
    ? 'This IshConnect certificate has been revoked. View its current verification status in the QuickLink Learning Portal.'
    : `${certificate.studentName} completed ${certificate.courseTitle} (${certificate.level}) through the QuickLink Learning Portal. Verify this IshConnect certificate online.`;
  const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="IshConnect · QuickLink Learning Portal"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(shareUrl)}"><meta property="og:image" content="${escapeHtml(imageUrl)}"><meta property="og:image:alt" content="IshConnect corporate seal"><meta name="twitter:card" content="summary"><meta http-equiv="refresh" content="0;url=${escapeHtml(verificationUrl)}"></head><body><p>Opening the <a href="${escapeHtml(verificationUrl)}">certificate verification page</a>…</p><script>window.location.replace(${JSON.stringify(verificationUrl)})</script></body></html>`);
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
  if (req.user.role !== 'owner' && certificate.student.toString() !== req.user._id.toString()) throw ApiError.forbidden('You cannot download another student’s certificate.');
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
  verifyCertificate,
  shareCertificate,
  revokeCertificate,
  downloadCertificate,
};
