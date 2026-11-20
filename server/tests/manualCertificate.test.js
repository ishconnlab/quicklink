import assert from 'node:assert/strict';
import test from 'node:test';
import { CourseCertificate } from '../src/models/CourseCertificate.js';

test('manual certificates validate without linking a student account or course', async () => {
  const certificate = new CourseCertificate({
    code: 'A'.repeat(32),
    kind: 'manual',
    studentName: 'Amina Example',
    courseTitle: 'Professional Skills',
    level: 'Training',
    issuedAt: new Date('2026-11-21T12:00:00.000Z'),
  });

  await assert.doesNotReject(certificate.validate());
  assert.equal(certificate.student, null);
  assert.equal(certificate.course, null);
});

test('manual certificates cannot be linked to a course', async () => {
  const certificate = new CourseCertificate({
    code: 'B'.repeat(32),
    kind: 'manual',
    course: '0123456789abcdef01234567',
    studentName: 'Amina Example',
    courseTitle: 'Professional Skills',
    level: 'Training',
  });

  await assert.rejects(certificate.validate(), /manual certificate cannot be linked/);
});

test('course certificates still require a student and a course or book', async () => {
  const certificate = new CourseCertificate({
    code: 'C'.repeat(32),
    kind: 'course',
    studentName: 'Amina Example',
    courseTitle: 'Professional Skills',
    level: 'Training',
  });

  await assert.rejects(certificate.validate(), /must reference a student/);
});
