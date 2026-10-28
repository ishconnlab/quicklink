import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { LearningBook } from '../src/models/LearningBook.js';
import { LearningProgress } from '../src/models/LearningProgress.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const unique = randomUUID().replaceAll('-', '');
const dbName = `quicklink_library_smoke_${unique}`;
const mongoUri = `mongodb://127.0.0.1:27017/${dbName}`;
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'quicklink-library-lifecycle-'));
const booksDir = path.join(tempRoot, 'books');
const sourceFile = path.resolve(here, '../src/books/L3/Software Development/TeM_SWDWD301_Website Development.pdf');
const initialDir = path.join(booksDir, 'L3', 'Smoke Subject');
const initialFile = path.join(initialDir, 'Imported Smoke Book.pdf');
let httpServer;
let base;
let testBookId;
let sourceKey;

async function request(url, { token, method = 'GET', body, form } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(form ? { body: form } : body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  await fs.mkdir(initialDir, { recursive: true });
  await fs.copyFile(sourceFile, initialFile);
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongoUri,
    JWT_SECRET: `isolated-library-smoke-${unique}`,
    OWNER_NAME: 'QuickLink Isolated Test Admin', OWNER_EMAIL: `owner-${unique}@quicklink.local`, OWNER_PASSWORD: 'IsolatedSmoke!234',
    LEARNING_BOOKS_DIR: booksDir,
    COURSE_IMAGE_DIR: path.join(tempRoot, 'images'), SUBMISSIONS_DIR: path.join(tempRoot, 'submissions'),
  });
  const { createApp } = await import('../src/app.js');
  const ensureOwnerAccount = (await import('../src/services/bootstrap.js')).default;
  const { syncAllIndexes } = await import('../src/models/syncIndexes.js');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await syncAllIndexes();
  await ensureOwnerAccount();
  httpServer = createHttpServer(createApp());
  await new Promise((resolve, reject) => httpServer.listen(0, '127.0.0.1', resolve).once('error', reject));
  base = `http://127.0.0.1:${httpServer.address().port}/api`;

  const unauthenticated = await request('/learning/books');
  assert.equal(unauthenticated.response.status, 401, 'Catalog endpoints require authentication');
  const ownerLogin = await request('/auth/login', { method: 'POST', body: { email: `owner-${unique}@quicklink.local`, password: 'IsolatedSmoke!234' } });
  assert.equal(ownerLogin.response.status, 200);
  const adminToken = ownerLogin.payload.data.token;
  const register = await request('/auth/register', { method: 'POST', body: { name: 'Library smoke learner', email: `learner-${unique}@quicklink.local`, password: 'IsolatedSmoke!234', educationLevel: 'L3' } });
  assert.equal(register.response.status, 202, 'Student registration waits for admin approval');
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: `learner-${unique}@quicklink.local`, password: 'IsolatedSmoke!234' } })).response.status, 403, 'Pending student cannot sign in');
  await request(`/users/${register.payload.data.user.id}`, { token: adminToken, method: 'PATCH', body: { registrationStatus: 'approved' } });
  const studentLogin = await request('/auth/login', { method: 'POST', body: { email: `learner-${unique}@quicklink.local`, password: 'IsolatedSmoke!234' } });
  assert.equal(studentLogin.response.status, 200, 'Approved student can sign in');
  const studentToken = studentLogin.payload.data.token;

  const initial = await request('/learning/books?manage=true', { token: adminToken });
  const imported = initial.payload.data.books.find((book) => book.fileName === 'Imported Smoke Book.pdf');
  assert.ok(imported, `Initial directory scan imports the test catalog document: ${JSON.stringify(initial.payload.data)}`);
  const repeated = await request('/learning/books?manage=true', { token: adminToken });
  assert.equal(repeated.payload.data.books.filter((book) => book.id === imported.id).length, 1, 'Repeated catalog refresh does not duplicate imports');
  const firstPreview = await request(`/learning/books/${imported.id}/preview`, { token: adminToken });
  assert.equal(firstPreview.response.status, 200);
  const firstDownload = await fetch(`${base}/learning/books/${imported.id}/file`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(firstDownload.status, 200);
  assert.equal((await firstDownload.arrayBuffer()).byteLength > 0, true);

  const pdf = await fs.readFile(sourceFile);
  const uploadForm = new FormData();
  uploadForm.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Uploaded Smoke Book.pdf');
  uploadForm.append('level', 'L4');
  uploadForm.append('category', 'Smoke Uploads');
  const upload = await request('/learning/books/upload', { token: adminToken, method: 'POST', form: uploadForm });
  assert.equal(upload.response.status, 201, `Admin upload works: ${JSON.stringify(upload.payload)}`);
  testBookId = upload.payload.data.book.id;
  const coverBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  const coverForm = new FormData();
  coverForm.append('cover', new Blob([coverBytes], { type: 'image/png' }), 'cover.png');
  const coverUpload = await request(`/learning/books/${testBookId}/cover`, { token: adminToken, method: 'POST', form: coverForm });
  assert.equal(coverUpload.response.status, 200, 'Administrator can upload a validated book cover');
  assert.ok(coverUpload.payload.data.book.coverUrl);
  const invalidCoverForm = new FormData();
  invalidCoverForm.append('cover', new Blob([pdf], { type: 'image/png' }), 'not-an-image.png');
  const invalidCover = await request(`/learning/books/${testBookId}/cover`, { token: adminToken, method: 'POST', form: invalidCoverForm });
  assert.equal(invalidCover.response.status, 400, 'Image uploads are validated by content and MIME type');
  const originalMetadata = { title: 'Preserved Smoke Metadata', description: 'Edited catalog metadata', category: 'Smoke Uploads', level: 'L4' };
  const edited = await request(`/learning/books/${testBookId}`, { token: adminToken, method: 'PATCH', body: originalMetadata });
  assert.equal(edited.response.status, 200);
  assert.equal((await request(`/learning/books/${testBookId}/preview`, { token: adminToken })).response.status, 200, 'Uploaded drafts can be previewed by administrators');
  const publish = await request(`/learning/books/${testBookId}`, { token: adminToken, method: 'PATCH', body: { active: true } });
  assert.equal(publish.response.status, 200);
  assert.ok((await request('/learning/books', { token: studentToken })).payload.data.books.some((book) => book.id === testBookId), 'Published upload is visible to students');
  const studentCover = await fetch(`${base}/learning/books/${testBookId}/cover`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(studentCover.status, 200, 'Published book cover can be displayed on student catalog cards');
  assert.equal(studentCover.headers.get('content-type'), 'image/png');
  await studentCover.arrayBuffer();

  const progress = await request(`/learning/books/${testBookId}/progress`, { token: studentToken, method: 'PUT', body: { currentPage: 19, totalPages: 20, totalUnits: 20, positionIndex: 19, timeSpentSeconds: 30 } });
  assert.equal(progress.response.status, 200);
  assert.equal(progress.payload.data.progress.completed, true);
  assert.ok((await request('/learning/summary', { token: studentToken })).payload.data.recentlyRead.some((book) => book.id === testBookId), 'Saved progress appears in the learning summary');

  const replaceForm = new FormData();
  replaceForm.append('file', new Blob([pdf], { type: 'application/pdf' }), 'Replacement Smoke Book.pdf');
  const replaced = await request(`/learning/books/${testBookId}/file`, { token: adminToken, method: 'POST', form: replaceForm });
  assert.equal(replaced.response.status, 200);
  assert.equal(replaced.payload.data.book.title, originalMetadata.title, 'Replacing a file preserves admin-edited metadata');
  assert.equal(replaced.payload.data.book.active, true, 'Replacing a file preserves availability');
  const retry = await request(`/learning/books/${testBookId}/retry`, { token: adminToken, method: 'POST', body: {} });
  assert.equal(retry.response.status, 200, 'Valid catalog entry can be reprocessed');

  const rawBook = await LearningBook.findById(testBookId).lean();
  sourceKey = rawBook.sourceKey;
  const absoluteSource = path.join(booksDir, sourceKey.split('/').join(path.sep));
  const fileBytes = await fs.readFile(absoluteSource);
  await fs.unlink(absoluteSource);
  const missingRetry = await request(`/learning/books/${testBookId}/retry`, { token: adminToken, method: 'POST', body: {} });
  assert.equal(missingRetry.response.status, 404, 'Missing source files return a useful error');
  await fs.writeFile(absoluteSource, fileBytes, { flag: 'wx' });
  const restored = await request(`/learning/books/${testBookId}/retry`, { token: adminToken, method: 'POST', body: {} });
  assert.equal(restored.response.status, 200, 'A repaired source file can be retried');

  const archive = await request(`/learning/books/${testBookId}`, { token: adminToken, method: 'PATCH', body: { active: false } });
  assert.equal(archive.response.status, 200);
  assert.equal((await fetch(`${base}/learning/books/${testBookId}/file`, { headers: { Authorization: `Bearer ${studentToken}` } })).status, 404, 'Archived documents are unavailable to students');
  const restore = await request(`/learning/books/${testBookId}`, { token: adminToken, method: 'PATCH', body: { active: true } });
  assert.equal(restore.response.status, 200);
  const studentDownload = await fetch(`${base}/learning/books/${testBookId}/file`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(studentDownload.status, 200, 'Restored documents can be downloaded');
  await studentDownload.arrayBuffer();

  const deleted = await request(`/learning/books/${testBookId}`, { token: adminToken, method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  testBookId = null;
  assert.equal((await request(`/learning/books/${upload.payload.data.book.id}/preview`, { token: adminToken })).response.status, 404, 'Deleted catalog entries cannot be previewed');
  assert.equal(await LearningProgress.countDocuments({ book: upload.payload.data.book.id }), 0, 'Deleting a document removes its saved progress');
  console.log('PASS: isolated import and duplicate refresh, preview, validated upload and cover image, metadata edit, publish, progress, replacement, retry/missing-file recovery, archive/restore, download, and deletion.');
} finally {
  if (httpServer?.listening) await new Promise((resolve) => httpServer.close(() => resolve()));
  if (mongoose.connection.readyState === 1) {
    if (testBookId) {
      const book = await LearningBook.findById(testBookId).lean().catch(() => null);
      if (book?.sourceKey) await fs.unlink(path.join(booksDir, book.sourceKey.split('/').join(path.sep))).catch(() => {});
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
}
