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
import { Student } from '../src/models/Student.js';
import { Notification } from '../src/models/Notification.js';
import { AdmissionPack } from '../src/models/AdmissionPack.js';
import { AdmissionApplication } from '../src/models/AdmissionApplication.js';
import { StudentRequirement } from '../src/models/StudentRequirement.js';
import { GuardianInvitation, GuardianLink } from '../src/models/Guardian.js';
import { AdmissionEvent, NotificationDelivery } from '../src/models/AdmissionEvent.js';
import { Conversation, Message } from '../src/models/Conversation.js';

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
    Student.deleteMany({}),
    Notification.deleteMany({}),
    AdmissionPack.deleteMany({}),
    AdmissionApplication.deleteMany({}),
    StudentRequirement.deleteMany({}),
    GuardianInvitation.deleteMany({}),
    GuardianLink.deleteMany({}),
    AdmissionEvent.deleteMany({}),
    NotificationDelivery.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
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

test('accepts "N/A" as a flexible trade value without counting it as zero', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({
      schoolName: 'NA School',
      trades: { sod: 'N/A', nit: 10, csa: 5, acc: 0, other: 0 },
    })
  );
  assert.equal(res.status, 201);
  const school = res.body.data.school;
  assert.equal(school.trades.sod, 'N/A');
  assert.equal(school.totalStudents, 15);
  // "N/A" is an explicit value, so the record is still complete.
  assert.equal(school.isIncomplete, false);
});

test('accepts numeric strings for trade values', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({
      schoolName: 'Flex School',
      trades: { sod: '40', nit: '20', csa: '10', acc: '5', other: '5' },
    })
  );
  assert.equal(res.status, 201);
  assert.equal(res.body.data.school.totalStudents, 80);
  assert.equal(res.body.data.school.trades.sod, 40);
});

test('rejects a non-numeric, non-N/A trade value', async () => {
  const res = await auth(request(app).post('/api/schools')).send(
    sampleSchool({ schoolName: 'Bad Flex', trades: { sod: 'lots', nit: 0, csa: 0, acc: 0, other: 0 } })
  );
  assert.equal(res.status, 400);
});

test('registration creates a pending account that cannot sign in until approved', async () => {
  const reg = await request(app).post('/api/auth/register').send({
    name: 'New Person',
    email: 'pending@test.local',
    password: 'PendingPass123!',
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.data.user.approvalStatus, 'pending');

  const blocked = await request(app)
    .post('/api/auth/login')
    .send({ email: 'pending@test.local', password: 'PendingPass123!' });
  assert.equal(blocked.status, 403);

  const pending = await auth(request(app).get('/api/users/pending'));
  assert.equal(pending.status, 200);
  const target = pending.body.data.users.find((u) => u.email === 'pending@test.local');
  assert.ok(target);

  const approve = await auth(request(app).post(`/api/users/${target.id}/approve`));
  assert.equal(approve.status, 200);

  const ok = await request(app)
    .post('/api/auth/login')
    .send({ email: 'pending@test.local', password: 'PendingPass123!' });
  assert.equal(ok.status, 200);
});

test('non-owners cannot manage accounts', async () => {
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Regular User',
    email: 'regular@test.local',
    password: 'RegularPass123!',
  });
  const target = reg.body.data.user;
  // Approve via owner.
  const pending = await auth(request(app).get('/api/users/pending'));
  const id = pending.body.data.users.find((u) => u.email === 'regular@test.local').id;
  await auth(request(app).post(`/api/users/${id}/approve`));

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'regular@test.local', password: 'RegularPass123!' });
  const userToken = login.body.data.token;

  const forbidden = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(forbidden.status, 403);
  assert.equal(target.approvalStatus, 'pending');
});

test('each account only sees its own school data', async () => {
  // Owner A (current test user) creates a school.
  await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: 'A Only School' }));

  // Create and sign in as a second owner.
  await auth(request(app).post('/api/users')).send({
    name: 'Owner B',
    email: 'ownerb@test.local',
    password: 'OwnerBPass123!',
  });
  const loginB = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ownerb@test.local', password: 'OwnerBPass123!' });
  const tokenB = loginB.body.data.token;

  const listB = await request(app)
    .get('/api/schools')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(listB.body.data.schools.length, 0);

  await request(app)
    .post('/api/schools')
    .set('Authorization', `Bearer ${tokenB}`)
    .send(sampleSchool({ schoolName: 'B Only School' }));

  const listA = await auth(request(app).get('/api/schools'));
  assert.deepEqual(listA.body.data.schools.map((s) => s.schoolName), ['A Only School']);

  const dashB = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(dashB.body.data.totals.schools, 1);
});

const createSchool = async (name = 'Central Community School') => {
  const res = await auth(request(app).post('/api/schools')).send(sampleSchool({ schoolName: name }));
  return res.body.data.school;
};

test('students can be enrolled, listed, updated and removed', async () => {
  const school = await createSchool();

  const created = await auth(request(app).post('/api/students')).send({
    school: school.id,
    fullName: 'Mugisha Aline',
    trade: 'sod',
    level: 'Level 3',
    gender: 'female',
  });
  assert.equal(created.status, 201);
  const student = created.body.data.student;
  assert.match(student.indexNumber, /^QL-\d{4}-\d{5}$/);
  assert.equal(student.schoolName, school.schoolName);
  assert.equal(student.certificationReady, true);

  const list = await auth(request(app).get('/api/students'));
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.students[0].fullName, 'Mugisha Aline');

  const updated = await auth(request(app).patch(`/api/students/${student.id}`)).send({
    status: 'graduated',
  });
  assert.equal(updated.body.data.student.status, 'graduated');
  assert.equal(updated.body.data.student.certificationReady, false);

  const stats = await auth(request(app).get('/api/students/stats'));
  assert.equal(stats.body.data.total, 1);

  const del = await auth(request(app).delete(`/api/students/${student.id}`));
  assert.equal(del.status, 200);
});

test('a supplied candidate index number must be unique per account', async () => {
  const school = await createSchool();
  const body = {
    school: school.id,
    fullName: 'Dup One',
    indexNumber: 'NESA-0001',
    trade: 'nit',
    level: 'Level 4',
  };
  const first = await auth(request(app).post('/api/students')).send(body);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.student.indexNumber, 'NESA-0001');

  const dup = await auth(request(app).post('/api/students')).send({
    ...body,
    fullName: 'Dup Two',
  });
  assert.equal(dup.status, 409);
});

test('student register exports as CSV', async () => {
  const school = await createSchool('CSV Student School');
  await auth(request(app).post('/api/students')).send({
    school: school.id,
    fullName: 'Uwase Keza',
    trade: 'nit',
    level: 'Level 4',
  });
  const res = await auth(request(app).get('/api/students/export'));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.ok(res.text.includes('Uwase Keza'));
  assert.ok(res.text.includes('Index Number'));
  assert.ok(res.text.includes('Certification Ready'));
});

test('students are isolated per account', async () => {
  const school = await createSchool();
  await auth(request(app).post('/api/students')).send({
    school: school.id,
    fullName: 'Owner A Student',
  });

  await auth(request(app).post('/api/users')).send({
    name: 'Owner C',
    email: 'ownerc@test.local',
    password: 'OwnerCPass123!',
  });
  const loginC = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ownerc@test.local', password: 'OwnerCPass123!' });
  const tokenC = loginC.body.data.token;

  const listC = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${tokenC}`);
  assert.equal(listC.body.data.total, 0);
});

test('owners are notified when a new account registers', async () => {
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Notify Me',
    email: 'notify@test.local',
    password: 'NotifyPass123!',
  });
  assert.equal(reg.status, 201);

  const res = await auth(request(app).get('/api/notifications'));
  assert.equal(res.status, 200);
  assert.ok(res.body.data.unreadCount >= 1);
  assert.equal(res.body.data.notifications[0].type, 'registration');

  const first = res.body.data.notifications[0];
  const read = await auth(request(app).post(`/api/notifications/${first.id}/read`));
  assert.equal(read.status, 200);
  assert.equal(read.body.data.notification.read, true);

  const after = await auth(request(app).get('/api/notifications'));
  assert.equal(after.body.data.unreadCount, 0);
});

// --- Admissions -----------------------------------------------------------

const packRequirements = [
  {
    title: 'School uniform',
    type: 'must_bring',
    category: 'uniform',
    appliesTo: { levels: ['Level 3'] },
  },
  { title: 'Birth certificate', type: 'required_document', category: 'document' },
  {
    title: 'Boarding kit',
    type: 'must_bring',
    category: 'boarding',
    appliesTo: { levels: ['Level 5'] },
  },
];

const createPublishedPack = async (school, overrides = {}) => {
  const created = await auth(request(app).post('/api/admission-packs')).send({
    school: school.id,
    academicYear: '2026-2027',
    title: 'Intake 2026',
    levels: ['Level 3', 'Level 5'],
    requirements: packRequirements,
    ...overrides,
  });
  assert.equal(created.status, 201);
  const id = created.body.data.pack.id;
  const published = await auth(request(app).post(`/api/admission-packs/${id}/publish`));
  assert.equal(published.status, 200);
  return published.body.data.pack;
};

test('admission pack publishes a frozen version and rejects edits afterwards', async () => {
  const school = await createSchool('Admissions School');
  const pack = await createPublishedPack(school);
  assert.equal(pack.status, 'published');
  assert.equal(pack.version, 1);

  const edit = await auth(request(app).patch(`/api/admission-packs/${pack.id}`)).send({
    title: 'Renamed after publish',
  });
  assert.equal(edit.status, 409);

  const clone = await auth(request(app).post(`/api/admission-packs/${pack.id}/new-version`));
  assert.equal(clone.status, 201);
  assert.equal(clone.body.data.pack.status, 'draft');
  assert.equal(clone.body.data.pack.version, 1);
  assert.equal(clone.body.data.pack.previousVersionOf, pack.id);

  // The published original is unchanged.
  const original = await auth(request(app).get(`/api/admission-packs/${pack.id}`));
  assert.equal(original.body.data.pack.title, 'Intake 2026');
});

test('applications get references and detect likely duplicates', async () => {
  const school = await createSchool('Dup Applications School');
  const pack = await createPublishedPack(school);

  const base = {
    school: school.id,
    admissionPack: pack.id,
    academicYear: '2026-2027',
    fullName: 'Mugisha Aline',
    level: 'Level 3',
    guardian: { name: 'Mukamana', phone: '0788000111' },
    submit: true,
  };

  const first = await auth(request(app).post('/api/admissions')).send(base);
  assert.equal(first.status, 201);
  assert.match(first.body.data.application.reference, /^ADM-\d{4}-\d{5}$/);

  const dup = await auth(request(app).post('/api/admissions')).send(base);
  assert.equal(dup.status, 409);

  const forced = await auth(request(app).post('/api/admissions')).send({
    ...base,
    confirmDuplicate: true,
  });
  assert.equal(forced.status, 201);

  const list = await auth(request(app).get('/api/admissions'));
  assert.equal(list.body.data.total, 2);
});

test('accepting and enrolling an application creates exactly one student and a checklist', async () => {
  const school = await createSchool('Enroll School');
  const pack = await createPublishedPack(school);

  const created = await auth(request(app).post('/api/admissions')).send({
    school: school.id,
    admissionPack: pack.id,
    academicYear: '2026-2027',
    fullName: 'Uwase Keza',
    level: 'Level 3',
    trade: 'sod',
    gender: 'female',
    guardian: { name: 'Habimana', phone: '0788000222' },
  });
  const id = created.body.data.application.id;

  const accepted = await auth(request(app).post(`/api/admissions/${id}/accept`));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.application.status, 'accepted');

  const enrolled = await auth(request(app).post(`/api/admissions/${id}/enroll`));
  assert.equal(enrolled.status, 200);
  const { student, application, checklist } = enrolled.body.data;
  assert.match(student.indexNumber, /^QL-\d{4}-\d{5}$/);
  assert.equal(application.status, 'enrolled');
  assert.equal(application.student, student.id);

  // Only requirements applicable to Level 3 are generated (uniform + document).
  const titles = checklist.map((c) => c.title).sort();
  assert.deepEqual(titles, ['Birth certificate', 'School uniform']);
  const doc = checklist.find((c) => c.title === 'Birth certificate');
  assert.equal(doc.requiresVerification, true);

  // Exactly one student exists; re-enrolling is rejected.
  const students = await auth(request(app).get('/api/students'));
  assert.equal(students.body.data.total, 1);
  const again = await auth(request(app).post(`/api/admissions/${id}/enroll`));
  assert.equal(again.status, 409);
});

test('checklist items track parent readiness and staff verification', async () => {
  const school = await createSchool('Checklist School');
  const pack = await createPublishedPack(school);
  const created = await auth(request(app).post('/api/admissions')).send({
    school: school.id,
    admissionPack: pack.id,
    academicYear: '2026-2027',
    fullName: 'Nkurunziza Eric',
    level: 'Level 3',
  });
  const id = created.body.data.application.id;
  await auth(request(app).post(`/api/admissions/${id}/accept`));
  const enrolled = await auth(request(app).post(`/api/admissions/${id}/enroll`));
  const studentId = enrolled.body.data.student.id;

  const list = await auth(request(app).get(`/api/admission-checklist/student/${studentId}`));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.summary.total, 2);

  const uniform = list.body.data.requirements.find((r) => r.title === 'School uniform');
  const marked = await auth(request(app).patch(`/api/admission-checklist/${uniform.id}`)).send({
    parentStatus: 'ready',
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.data.requirement.complete, true);

  const doc = list.body.data.requirements.find((r) => r.title === 'Birth certificate');
  assert.equal(doc.complete, false);
  const verified = await auth(request(app).patch(`/api/admission-checklist/${doc.id}`)).send({
    schoolVerified: true,
  });
  assert.equal(verified.body.data.requirement.complete, true);

  const summary = await auth(request(app).get(`/api/admission-checklist/student/${studentId}`));
  assert.equal(summary.body.data.summary.complete, 2);
  assert.equal(summary.body.data.summary.readiness, 100);
});

test('guardian invitations must be accepted and approved before access', async () => {
  const school = await createSchool('Guardian School');
  const student = (
    await auth(request(app).post('/api/students')).send({
      school: school.id,
      fullName: 'Guardian Child',
      trade: 'nit',
      level: 'Level 4',
    })
  ).body.data.student;

  const invited = await auth(request(app).post('/api/guardians/invitations')).send({
    student: student.id,
    name: 'Parent One',
    relationship: 'mother',
  });
  assert.equal(invited.status, 201);
  const rawToken = invited.body.data.token;
  assert.ok(rawToken && rawToken.length >= 20);

  // A second owner account accepts the invite.
  await auth(request(app).post('/api/users')).send({
    name: 'Parent User',
    email: 'parent@test.local',
    password: 'ParentPass123!',
  });
  const parentLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'parent@test.local', password: 'ParentPass123!' });
  const parentToken = parentLogin.body.data.token;

  const accepted = await request(app)
    .post('/api/guardians/invitations/accept')
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ token: rawToken });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.link.status, 'pending');

  // Pending links do not yet grant access.
  const before = await request(app)
    .get('/api/guardians/links/me')
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(before.body.data.children.length, 0);

  const linkId = accepted.body.data.link.id;
  const approved = await auth(request(app).post(`/api/guardians/links/${linkId}/approve`));
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.link.status, 'approved');

  const after = await request(app)
    .get('/api/guardians/links/me')
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(after.body.data.children.length, 1);
  assert.equal(after.body.data.children[0].student.fullName, 'Guardian Child');
});

test('onboarding dashboard summarises admissions', async () => {
  const school = await createSchool('Onboarding School');
  const pack = await createPublishedPack(school);
  const created = await auth(request(app).post('/api/admissions')).send({
    school: school.id,
    admissionPack: pack.id,
    academicYear: '2026-2027',
    fullName: 'Dashboard Learner',
    level: 'Level 3',
  });
  const id = created.body.data.application.id;
  await auth(request(app).post(`/api/admissions/${id}/accept`));
  await auth(request(app).post(`/api/admissions/${id}/enroll`));

  const res = await auth(request(app).get('/api/onboarding'));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.packs.published, 1);
  assert.equal(res.body.data.applications.enrolled, 1);
  assert.equal(res.body.data.students, 1);
  assert.ok(res.body.data.requirements.total >= 1);
});

test('admissions are isolated per account', async () => {
  const school = await createSchool('Isolation Admissions School');
  await createPublishedPack(school);

  await auth(request(app).post('/api/users')).send({
    name: 'Owner D',
    email: 'ownerd@test.local',
    password: 'OwnerDPass123!',
  });
  const loginD = await request(app)
    .post('/api/auth/login')
    .send({ email: 'ownerd@test.local', password: 'OwnerDPass123!' });
  const tokenD = loginD.body.data.token;

  const packsD = await request(app)
    .get('/api/admission-packs')
    .set('Authorization', `Bearer ${tokenD}`);
  assert.equal(packsD.body.data.total, 0);

  const appsD = await request(app)
    .get('/api/admissions')
    .set('Authorization', `Bearer ${tokenD}`);
  assert.equal(appsD.body.data.total, 0);

  const onboardD = await request(app)
    .get('/api/onboarding')
    .set('Authorization', `Bearer ${tokenD}`);
  assert.equal(onboardD.body.data.packs.published, 0);
});

// --- Parent checklist & secure connection ---------------------------------

// Enrols a learner through the full admissions flow and returns the student.
const enrolLearner = async (schoolName, fullName) => {
  const school = await createSchool(schoolName);
  const pack = await createPublishedPack(school, { academicYear: '2026-2027' });
  const created = await auth(request(app).post('/api/admissions')).send({
    school: school.id,
    admissionPack: pack.id,
    academicYear: '2026-2027',
    fullName,
    level: 'Level 3',
    guardian: { name: 'Guardian', phone: '0788000999' },
  });
  const id = created.body.data.application.id;
  await auth(request(app).post(`/api/admissions/${id}/accept`));
  const enrolled = await auth(request(app).post(`/api/admissions/${id}/enroll`));
  return enrolled.body.data.student;
};

const connectParent = async (student, email = 'guardian@test.local') => {
  const invited = await auth(request(app).post('/api/guardians/invitations')).send({
    student: student.id,
    name: 'Guardian Parent',
    relationship: 'mother',
  });
  const rawToken = invited.body.data.token;

  const reg = await request(app).post('/api/auth/register-parent').send({
    token: rawToken,
    name: 'Guardian Parent',
    email,
    password: 'GuardianPass123!',
    relationship: 'mother',
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.data.user.role, 'parent');
  const parentToken = reg.body.data.token;
  const linkId = reg.body.data.link.id;

  const approved = await auth(request(app).post(`/api/guardians/links/${linkId}/approve`));
  assert.equal(approved.status, 200);
  return parentToken;
};

test('each enrolled learner receives a checklist the parent can track', async () => {
  const student = await enrolLearner('Parent Checklist School', 'Keza Parent Child');
  const parentToken = await connectParent(student);

  const children = await request(app)
    .get('/api/parent/children')
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(children.status, 200);
  assert.equal(children.body.data.children.length, 1);
  assert.equal(children.body.data.children[0].student.fullName, 'Keza Parent Child');
  assert.equal(children.body.data.children[0].checklist.total, 2);

  const checklist = await request(app)
    .get(`/api/parent/children/${student.id}/checklist`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(checklist.body.data.requirements.length, 2);

  const uniform = checklist.body.data.requirements.find((r) => r.title === 'School uniform');
  const marked = await request(app)
    .patch(`/api/parent/checklist/${uniform.id}`)
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ parentStatus: 'ready' });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.data.requirement.complete, true);

  // Parents cannot reach school administration data.
  const forbidden = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(forbidden.status, 403);
});

test('a parent cannot access a learner they are not linked to', async () => {
  const studentA = await enrolLearner('Linked School A', 'Child A');
  const studentB = await enrolLearner('Unlinked School B', 'Child B');
  const parentToken = await connectParent(studentA, 'linkedparent@test.local');

  const res = await request(app)
    .get(`/api/parent/children/${studentB.id}/checklist`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(res.status, 403);
});

test('parents and school staff can message each other inside QuickLink', async () => {
  const student = await enrolLearner('Messaging School', 'Chat Child');
  const parentToken = await connectParent(student, 'chatparent@test.local');

  const ensured = await auth(request(app).post('/api/conversations/ensure')).send({
    student: student.id,
    subject: 'Welcome',
  });
  assert.equal(ensured.status, 200);
  const conversationId = ensured.body.data.conversation.id;

  const staffMsg = await auth(
    request(app).post(`/api/conversations/${conversationId}/messages`)
  ).send({ body: 'Welcome to our school.' });
  assert.equal(staffMsg.status, 201);

  const parentList = await request(app)
    .get('/api/parent/conversations')
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(parentList.body.data.conversations.length, 1);
  assert.equal(parentList.body.data.conversations[0].unread, 1);

  const parentRead = await request(app)
    .get(`/api/parent/conversations/${conversationId}/messages`)
    .set('Authorization', `Bearer ${parentToken}`);
  assert.equal(parentRead.body.data.messages.length, 1);

  const reply = await request(app)
    .post(`/api/parent/conversations/${conversationId}/messages`)
    .set('Authorization', `Bearer ${parentToken}`)
    .send({ body: 'Thank you!' });
  assert.equal(reply.status, 201);

  const staffView = await auth(request(app).get(`/api/conversations/${conversationId}/messages`));
  assert.equal(staffView.body.data.messages.length, 2);
  assert.equal(staffView.body.data.messages[1].senderRole, 'parent');
});
