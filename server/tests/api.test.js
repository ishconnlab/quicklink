import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import {
  setupTestDb,
  teardownTestDb,
  createTestUser,
  makeApp,
} from './helpers.js';
import { User } from '../src/models/User.js';
import { School } from '../src/models/School.js';
import { Holding } from '../src/models/Holding.js';
import { AuditLog } from '../src/models/AuditLog.js';

let app;
let token;

const sampleSchool = (overrides = {}) => ({
  holding: 'Northern Education Initiative',
  schoolName: 'Central Community School',
  district: 'Central',
  dateOfCollection: '2026-01-15',
  trades: { sod: 100, nit: 50, csa: 25, acc: 10, other: 5 },
  laptops: 30,
  teachers: 12,
  feedback: 'Needs more laptops.',
  ...overrides,
});

before(async () => {
  await setupTestDb();
  app = makeApp();
});

after(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    School.deleteMany({}),
    Holding.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  const user = await createTestUser();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Password123!' });
  token = res.body.data.token;
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

const binaryParser = (res, callback) => {
  const data = [];
  res.on('data', (chunk) => data.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(data)));
};

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});

test('login rejects bad credentials', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@test.local', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('protected routes require authentication', async () => {
  const res = await request(app).get('/api/schools');
  assert.equal(res.status, 401);
});

test('creates a school and calculates total students', async () => {
  const res = await auth(request(app).post('/api/schools')).send(sampleSchool());
  assert.equal(res.status, 201);
  const school = res.body.data.school;
  assert.equal(school.totalStudents, 190);
  assert.equal(school.isIncomplete, false);
  assert.equal(school.trades.sod, 100);
});

test('calculates total as sum of all five trades', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({
      schoolName: 'Totals School',
      trades: { sod: 1, nit: 2, csa: 3, acc: 4, other: 5 },
    })
  );
  assert.equal(res.body.data.school.totalStudents, 15);
});

test('rejects negative trade counts', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Negative School', trades: { sod: -5, nit: 0, csa: 0, acc: 0, other: 0 } })
  );
  assert.equal(res.status, 400);
});

test('marks unknown trade values as incomplete without counting as zero', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({
      schoolName: 'Incomplete School',
      trades: { sod: 10, nit: null, csa: 5, acc: null, other: 0 },
      laptops: null,
    })
  );
  assert.equal(res.status, 201);
  const school = res.body.data.school;
  assert.equal(school.totalStudents, 15);
  assert.equal(school.isIncomplete, true);
  assert.ok(school.incompleteFields.includes('trades.nit'));
  assert.ok(school.incompleteFields.includes('trades.acc'));
  assert.ok(school.incompleteFields.includes('laptops'));
});

test('adding another school does not overwrite the first', async () => {
  const first = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'First School' })
  );
  const second = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Second School' })
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.data.school.id, second.body.data.school.id);

  const list = await auth(request(app).get('/api/schools'));
  const names = list.body.data.schools.map((s) => s.schoolName).sort();
  assert.deepEqual(names, ['First School', 'Second School']);
});

test('validates duplicate school under the same holding', async () => {
  await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: 'Dup School' }));
  const dup = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Dup School' })
  );
  assert.equal(dup.status, 409);
  assert.ok(dup.body.error.details.duplicates.length >= 1);
});

test('allows duplicate school when confirmed', async () => {
  await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: 'Confirm School' }));
  const dup = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Confirm School', confirmDuplicate: true })
  );
  assert.equal(dup.status, 201);
});

test('same school name under a different holding is allowed', async () => {
  await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: 'Shared Name' }));
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Shared Name', holding: 'Other Holding' })
  );
  assert.equal(res.status, 201);
});

test('edits a school independently', async () => {
  const created = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Editable School' })
  );
  const id = created.body.data.school.id;
  const updated = await auth(request(app).patch(`/api/schools/${id}`)).send({
    teachers: 99,
    trades: { sod: 200 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.school.teachers, 99);
  assert.equal(updated.body.data.school.trades.sod, 200);
  assert.equal(updated.body.data.school.trades.nit, 50);
});

test('archives and restores a school', async () => {
  const created = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Archive School' })
  );
  const id = created.body.data.school.id;

  await auth(request(app).post(`/api/schools/${id}/archive`));
  let list = await auth(request(app).get('/api/schools?status=active'));
  assert.equal(list.body.data.schools.length, 0);

  list = await auth(request(app).get('/api/schools?status=archived'));
  assert.equal(list.body.data.schools.length, 1);

  await auth(request(app).post(`/api/schools/${id}/restore`));
  list = await auth(request(app).get('/api/schools?status=active'));
  assert.equal(list.body.data.schools.length, 1);
});

test('records history for a school', async () => {
  const created = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'History School' })
  );
  const id = created.body.data.school.id;
  await auth(request(app).patch(`/api/schools/${id}`)).send({ teachers: 7 });
  const history = await auth(request(app).get(`/api/schools/${id}/history`));
  assert.equal(history.status, 200);
  assert.ok(history.body.data.history.length >= 2);
});

test('searches and filters schools', async () => {
  await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Alpha School', district: 'Central' })
  );
  await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Beta School', district: 'Riverside' })
  );
  const search = await auth(request(app).get('/api/schools?search=Alpha'));
  assert.equal(search.body.data.schools.length, 1);
  const filter = await auth(request(app).get('/api/schools?district=Riverside'));
  assert.equal(filter.body.data.schools.length, 1);
});

test('offline sync is idempotent via clientId', async () => {
  const payload = sampleSchool({ schoolName: 'Sync School', clientId: 'client-abc-123' });
  const first = await auth(request(app).post('/api/schools')).send(payload);
  const second = await auth(request(app).post('/api/schools')).send(payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.data.idempotent, true);
  assert.equal(first.body.data.school.id, second.body.data.school.id);
});

test('dashboard aggregates live statistics', async () => {
  await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Dash One' })
  );
  await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Dash Two', district: 'Riverside' })
  );
  const res = await auth(request(app).get('/api/dashboard'));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.totals.schools, 2);
  assert.equal(res.body.data.totals.students, 380);
  assert.equal(res.body.data.totals.trades.sod, 200);
  assert.ok(res.body.data.byDistrict.length >= 1);
});

test('creates additional user accounts without exposing passwords', async () => {
  const res = await auth(request(app).post('/api/users')).send({
    name: 'Second User',
    email: 'second@test.local',
    password: 'AnotherPass123!',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.email, 'second@test.local');
  assert.equal(res.body.data.user.passwordHash, undefined);
});

test('user accounts share the same role', async () => {
  const res = await auth(request(app).post('/api/users')).send({
    name: 'Third User',
    email: 'third@test.local',
    password: 'AnotherPass123!',
  });
  assert.equal(res.body.data.user.role, 'user');
});

test('changes password and invalidates old sessions', async () => {
  const change = await auth(request(app).post('/api/auth/change-password')).send({
    currentPassword: 'Password123!',
    newPassword: 'BrandNewPass123!',
  });
  assert.equal(change.status, 200);
  const relogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@test.local', password: 'BrandNewPass123!' });
  assert.equal(relogin.status, 200);
});

test('generates a multi-page individual school PDF', async () => {
  const created = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'PDF School' })
  );
  const id = created.body.data.school.id;
  const res = await auth(request(app).get(`/api/reports/pdf/school/${id}`))
    .buffer(true)
    .parse(binaryParser);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.ok(res.body.length > 1000);
  assert.equal(res.body.slice(0, 4).toString(), '%PDF');
});

test('generates a complete report PDF with many schools', async () => {
  for (let i = 0; i < 30; i++) {
    await auth(request(app).post('/api/schools')).send(
      sampleSchool({
        schoolName: `Bulk School ${i}`,
        district: `District ${i % 5}`,
        feedback: 'Long feedback '.repeat(20),
      })
    );
  }
  const res = await auth(request(app).get('/api/reports/pdf/all'))
    .buffer(true)
    .parse(binaryParser);
  assert.equal(res.status, 200);
  assert.equal(res.body.slice(0, 4).toString(), '%PDF');
  assert.ok(res.body.length > 5000);
});

test('exports CSV for all schools', async () => {
  await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: 'CSV School' }));
  const res = await auth(request(app).get('/api/reports/csv/all'));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.ok(res.text.includes('CSV School'));
  assert.ok(res.text.includes('Total Students'));
});
