import assert from 'node:assert/strict';
import config from '../src/config/env.js';

const base = process.env.SMOKE_API_URL || `http://127.0.0.1:${config.port}`;
const password = 'LibrarySmoke!234';
async function request(endpoint, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api${endpoint}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { response, payload };
}

const unauthorized = await request('/learning/books');
  assert.equal(unauthorized.response.status, 401, 'Learning catalog must require authentication');

  const adminLogin = await request('/auth/login', { method: 'POST', body: { email: config.owner.email, password: config.owner.password } });
  assert.equal(adminLogin.response.status, 200, 'Configured owner account should be able to sign in');
  const adminToken = adminLogin.payload.data.token;

  let firstIds;
  for (const endpoint of ['/learning/books', '/learning/books?manage=true']) {
    const result = await request(endpoint, { token: adminToken });
    assert.equal(result.response.status, 200, `${endpoint} should return successfully`);
    assert.ok(Array.isArray(result.payload.data.supportedFormats));
    assert.ok(result.payload.data.books.every((book) => book.format && book.processingStatus));
    if (endpoint === '/learning/books?manage=true') firstIds = result.payload.data.books.map((book) => book.id).sort();
  }
  const summary = await request('/learning/summary', { token: adminToken });
  assert.equal(summary.response.status, 200, 'Learning summary should return successfully');
  assert.ok(Number.isInteger(summary.payload.data.totalBooks));

  const repeated = await request('/learning/books?manage=true', { token: adminToken });
  assert.equal(repeated.response.status, 200);
  assert.deepEqual(repeated.payload.data.books.map((book) => book.id).sort(), firstIds, 'Repeated catalog refresh must keep stable IDs and avoid duplicate records');
  const available = repeated.payload.data.books.find((book) => book.active && book.processingStatus === 'ready');
  assert.ok(available, 'Smoke test requires at least one valid learning document');
  const preview = await request(`/learning/books/${available.id}/preview`, { token: adminToken });
  assert.equal(preview.response.status, 200, 'An authorized member should receive a safe document preview');
  assert.equal(preview.payload.data.format, available.format);
  const download = await fetch(`${base}/api/learning/books/${available.id}/file`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(download.status, 200, 'An authorized member should be able to download a learning document');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Number(download.headers.get('content-length')) > 0, 'Download should contain document bytes');
  const deniedProgress = await request(`/learning/books/${available.id}/progress`, { token: adminToken, method: 'PUT', body: { currentPage: 1 } });
  assert.equal(deniedProgress.response.status, 403, 'Admin should not write student progress');

console.log('PASS: learning authentication, catalog endpoints, summary, stable catalog refresh IDs, safe preview/download, and progress role enforcement.');
