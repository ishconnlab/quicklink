import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { evaluateCourseCompletion } from '../services/courseCompletion.js';

function certificateJson(certificate) {
  return { id: certificate._id.toString(), courseId: certificate.course.toString(), code: certificate.code, studentName: certificate.studentName, courseTitle: certificate.courseTitle, level: certificate.level, issuedAt: certificate.issuedAt, revoked: Boolean(certificate.revokedAt), verificationPath: `/verify/${certificate.code}` };
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
  let certificate;
  try {
    certificate = await CourseCertificate.findOneAndUpdate(
      { student: req.user._id, course: course._id },
      { $setOnInsert: { code: randomBytes(24).toString('base64url'), student: req.user._id, course: course._id, studentName: req.user.name, courseTitle: course.title, level: course.level, issuedAt: new Date() } },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    certificate = await CourseCertificate.findOne({ student: req.user._id, course: course._id });
  }
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

export const verifyCertificate = asyncHandler(async (req, res) => {
  const certificate = await CourseCertificate.findOne({ code: req.params.code }).lean();
  if (!certificate) return res.status(404).json({ success: true, data: { valid: false, status: 'not-found' } });
  res.json({ success: true, data: { valid: !certificate.revokedAt, status: certificate.revokedAt ? 'revoked' : 'valid', studentName: certificate.studentName, courseTitle: certificate.courseTitle, level: certificate.level, issuedAt: certificate.issuedAt, certificateId: certificate.code } });
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
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/certificates/verify/${certificate.code}`;
  const qr = await QRCode.toBuffer(verificationUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 180 });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 48 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  doc.rect(24, 24, 794, 547).lineWidth(2).strokeColor('#1d4ed8').stroke();
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#1d4ed8').text('QUICKLINK', 48, 60, { align: 'center', characterSpacing: 3 });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(32).fillColor('#0f172a').text('Certificate of Completion', { align: 'center' });
  doc.moveDown(1.25);
  doc.font('Helvetica').fontSize(15).fillColor('#475569').text('This certifies that', { align: 'center' });
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(27).fillColor('#0f172a').text(certificate.studentName, { align: 'center' });
  doc.moveDown(0.7);
  doc.font('Helvetica').fontSize(15).fillColor('#475569').text('has successfully completed', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(21).fillColor('#1d4ed8').text(certificate.courseTitle, { align: 'center', width: 650 });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(14).fillColor('#475569').text(`${certificate.level} · Issued ${new Date(certificate.issuedAt).toLocaleDateString('en-GB')}`, { align: 'center' });
  doc.image(qr, 690, 405, { width: 90 });
  doc.fontSize(9).text(`Certificate ID: ${certificate.code}`, 48, 470);
  doc.fontSize(8).fillColor('#64748b').text(`Verify: ${verificationUrl}`, 48, 488, { width: 580 });
  doc.end();
  await completed;
  const buffer = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="quicklink-certificate-${certificate.code}.pdf"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export default { getCourseCompletion, issueCertificate, listMyCertificates, verifyCertificate, revokeCertificate, downloadCertificate };
