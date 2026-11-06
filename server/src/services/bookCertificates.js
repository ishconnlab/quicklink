import { randomBytes } from 'node:crypto';
import { CourseCertificate } from '../models/CourseCertificate.js';

export async function findOrIssueBookCertificate(book, student, studentName = student.name) {
  if (!book || !student) return null;
  try {
    return await CourseCertificate.findOneAndUpdate(
      { student: student._id, book: book._id, kind: 'book' },
      {
        $setOnInsert: {
          code: randomBytes(24).toString('base64url'),
          student: student._id,
          kind: 'book',
          book: book._id,
          course: null,
          studentName,
          courseTitle: book.title,
          level: book.level,
          issuedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return CourseCertificate.findOne({ student: student._id, book: book._id, kind: 'book' });
  }
}

export function bookCertificateJson(certificate) {
  if (!certificate) return null;
  return {
    id: certificate._id.toString(),
    bookId: certificate.book?.toString() || null,
    kind: certificate.kind || 'book',
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

export default { findOrIssueBookCertificate, bookCertificateJson };
