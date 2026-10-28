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
    assert.equal(completion.status, 401);
    assert.equal(issue.status, 401);
    assert.equal(download.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
