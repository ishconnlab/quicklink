import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

test('liveness health responds while API requests wait for startup readiness', async () => {
  const app = createApp();
  app.locals.startupReady = false;
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const [health, apiHealth, readiness, apiRequest] = await Promise.all([
      fetch(`${root}/health`),
      fetch(`${root}/api/health`),
      fetch(`${root}/health/ready`),
      fetch(`${root}/api/auth/login`, { method: 'POST' }),
    ]);
    assert.equal(health.status, 200);
    assert.equal(apiHealth.status, 200);
    assert.equal(readiness.status, 503);
    assert.equal(apiRequest.status, 503);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('certificate completion and issuance endpoints reject unauthenticated requests', async () => {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const root = `http://127.0.0.1:${address.port}`;
  try {
    const completion = await fetch(`${root}/api/courses/0123456789abcdef01234567/completion`);
    const issue = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificate`, { method: 'POST' });
    const download = await fetch(`${root}/api/certificates/verify/not-a-valid-code`);
    const downloadByCode = await fetch(`${root}/api/certificates/${'a'.repeat(32)}.pdf`);
    const candidates = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificate-candidates`);
    const bulkIssue = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificates/issue`, { method: 'POST' });
    const editName = await fetch(`${root}/api/certificates/0123456789abcdef01234567/name`, { method: 'PATCH' });
    const share = await fetch(`${root}/api/certificates/share/not-a-valid-code`);
    const registrationAdmin = await fetch(`${root}/api/registrations`);
    const invalidRegistrationForm = await fetch(`${root}/api/registrations/public/invalid`);
    const assessmentStatus = await fetch(`${root}/api/learning/books/0123456789abcdef01234567/final-assessment`);
    const assessmentSubmit = await fetch(`${root}/api/learning/books/0123456789abcdef01234567/final-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    });
    const certificationSettings = await fetch(`${root}/api/courses/0123456789abcdef01234567/certification-assessment/settings`);
    const saveCertificationSettings = await fetch(`${root}/api/courses/0123456789abcdef01234567/certification-assessment/settings`, { method: 'PUT' });
    const certificationAssessment = await fetch(`${root}/api/courses/0123456789abcdef01234567/certification-assessment`);
    const submitCertificationAssessment = await fetch(`${root}/api/courses/0123456789abcdef01234567/certification-assessment`, { method: 'POST' });
    const adminDashboard = await fetch(`${root}/api/users/dashboard-summary`);
    const teacherList = await fetch(`${root}/api/users/teachers`);
    const teacherFollowers = await fetch(`${root}/api/users/followers`);
    const permanentClassDelete = await fetch(`${root}/api/classes/0123456789abcdef01234567/permanent`, { method: 'DELETE' });
    const permanentUserDelete = await fetch(`${root}/api/users/0123456789abcdef01234567`, { method: 'DELETE' });
    const assignmentDelete = await fetch(`${root}/api/assignments/0123456789abcdef01234567`, { method: 'DELETE' });
    const linkRegistrationAccount = await fetch(`${root}/api/registrations/public/${'a'.repeat(32)}/claim-account`, { method: 'POST' });
    const createEnrollment = await fetch(`${root}/api/admin/enrollments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const deleteEnrollment = await fetch(`${root}/api/admin/enrollments/0123456789abcdef01234567`, { method: 'DELETE' });
    const deleteCertificate = await fetch(`${root}/api/certificates/0123456789abcdef01234567`, { method: 'DELETE' });
    const deleteRegistration = await fetch(`${root}/api/registrations/0123456789abcdef01234567/entries/0123456789abcdef01234567`, { method: 'DELETE' });
    assert.equal(completion.status, 401);
    assert.equal(issue.status, 401);
    assert.equal(download.status, 400);
    assert.equal(downloadByCode.status, 401);
    assert.equal(candidates.status, 401);
    assert.equal(bulkIssue.status, 401);
    assert.equal(editName.status, 401);
    assert.equal(share.status, 400);
    assert.equal(registrationAdmin.status, 401);
    assert.equal(invalidRegistrationForm.status, 400);
    assert.equal(assessmentStatus.status, 404);
    assert.equal(assessmentSubmit.status, 404);
    assert.equal(certificationSettings.status, 401);
    assert.equal(saveCertificationSettings.status, 401);
    assert.equal(certificationAssessment.status, 401);
    assert.equal(submitCertificationAssessment.status, 401);
    assert.equal(adminDashboard.status, 401);
    assert.equal(teacherList.status, 401);
    assert.equal(teacherFollowers.status, 401);
    assert.equal(permanentClassDelete.status, 401);
    assert.equal(permanentUserDelete.status, 401);
    assert.equal(assignmentDelete.status, 401);
    assert.equal(linkRegistrationAccount.status, 401);
    assert.equal(createEnrollment.status, 401);
    assert.equal(deleteEnrollment.status, 401);
    assert.equal(deleteCertificate.status, 401);
    assert.equal(deleteRegistration.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
