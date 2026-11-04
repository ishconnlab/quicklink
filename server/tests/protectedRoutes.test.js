import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

test('certificate completion and issuance endpoints reject unauthenticated requests', async () => {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const root = `http://127.0.0.1:${address.port}`;
  try {
    const completion = await fetch(`${root}/api/courses/0123456789abcdef01234567/completion`);
    const issue = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificate`, { method: 'POST' });
    const download = await fetch(`${root}/api/certificates/verify/not-a-valid-code`);
    const candidates = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificate-candidates`);
    const bulkIssue = await fetch(`${root}/api/courses/0123456789abcdef01234567/certificates/issue`, { method: 'POST' });
    const share = await fetch(`${root}/api/certificates/share/not-a-valid-code`);
    const registrationAdmin = await fetch(`${root}/api/registrations`);
    const invalidRegistrationForm = await fetch(`${root}/api/registrations/public/invalid`);
    const assessmentStatus = await fetch(`${root}/api/learning/books/0123456789abcdef01234567/final-assessment`);
    const assessmentSubmit = await fetch(`${root}/api/learning/books/0123456789abcdef01234567/final-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    });
    assert.equal(completion.status, 401);
    assert.equal(issue.status, 401);
    assert.equal(download.status, 400);
    assert.equal(candidates.status, 401);
    assert.equal(bulkIssue.status, 401);
    assert.equal(share.status, 400);
    assert.equal(registrationAdmin.status, 401);
    assert.equal(invalidRegistrationForm.status, 400);
    assert.equal(assessmentStatus.status, 401);
    assert.equal(assessmentSubmit.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
