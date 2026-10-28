import assert from 'node:assert/strict';
import { io } from '../../client/node_modules/socket.io-client/build/esm-debug/index.js';
import { User } from '../src/models/User.js';
import { LearningClass } from '../src/models/LearningClass.js';
import { LiveSession } from '../src/models/LiveSession.js';
import { ClassChatMessage } from '../src/models/ClassChatMessage.js';
import { ClassSessionNote } from '../src/models/ClassSessionNote.js';
import { ClassInvitation } from '../src/models/ClassInvitation.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import config from '../src/config/env.js';
import ensureOwnerAccount from '../src/services/bootstrap.js';

const base = process.env.SMOKE_API_URL || `http://127.0.0.1:${config.port}`;
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `smoke-teacher-${unique}@quicklink.local`;
const studentEmail = `smoke-student-${unique}@quicklink.local`;
const outsiderEmail = `smoke-outsider-${unique}@quicklink.local`;
const password = 'LocalSmoke!234';
let classId;
let sessionId;
let socket;

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${json?.error?.message}`);
  return json.data;
}

try {
  await connectDB();
  await ensureOwnerAccount();
  const owner = await request('/auth/login', { method: 'POST', body: { email: config.owner.email, password: config.owner.password } });
  const teacher = (await request('/users', { token: owner.token, method: 'POST', body: { name: 'Local Smoke Teacher', email: teacherEmail, password, role: 'teacher' } })).user;
  const student = (await request('/users', { token: owner.token, method: 'POST', body: { name: 'Local Smoke Student', email: studentEmail, password, role: 'student', educationLevel: 'L3' } })).user;
  await request('/users', { token: owner.token, method: 'POST', body: { name: 'Local Smoke Outsider', email: outsiderEmail, password, role: 'student', educationLevel: 'L3' } });
  const teacherLogin = await request('/auth/login', { method: 'POST', body: { email: teacherEmail, password } });
  const studentLogin = await request('/auth/login', { method: 'POST', body: { email: studentEmail, password } });

  const created = await request('/classes', {
    token: owner.token,
    method: 'POST',
    body: { title: `Local smoke class ${unique}`, subject: 'Software Development', level: 'L3', teacherId: teacher.id, studentIds: [student.id] },
  });
  classId = created.class.id;
  if (!config.mail.smtpUrl) {
    const inviteResult = await request(`/classes/${classId}/invitations`, { token: teacherLogin.token, method: 'POST', body: { studentIds: [student.id] } });
    assert.equal(inviteResult.invitations[0]?.status, 'failed', 'Invitation should report failure when SMTP is not configured');
    assert.match(inviteResult.invitations[0]?.lastError || '', /not configured/i);
  }
  const started = await request(`/classes/${classId}/sessions`, { token: teacherLogin.token, method: 'POST', body: {} });
  sessionId = started.session.id;
  const outsiderLogin = await request('/auth/login', { method: 'POST', body: { email: outsiderEmail, password } });
  const unauthorized = await fetch(`${base}/api/classes/join/${started.session.sessionCode}`, {
    headers: { Authorization: `Bearer ${outsiderLogin.token}` },
  });
  assert.equal(unauthorized.status, 403, 'A student outside the roster must not access the live join link');
  const joinData = await request(`/classes/join/${started.session.sessionCode}`, { token: studentLogin.token });
  assert.equal(joinData.session.id, sessionId);
  const tokenResponse = await fetch(`${base}/api/classes/sessions/${sessionId}/livekit-token`, { method: 'POST', headers: { Authorization: `Bearer ${teacherLogin.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  const tokenPayload = await tokenResponse.json();
  const liveKitConfigured = tokenResponse.ok;
  if (liveKitConfigured) assert.ok(tokenPayload.data.token && tokenPayload.data.token.split('.').length === 3, 'Server should issue a signed LiveKit room token');
  else {
    assert.equal(tokenResponse.status, 409);
    assert.match(tokenPayload.error.message, /Live classroom media is not configured/i);
  }
  const deniedMediaToken = await fetch(`${base}/api/classes/sessions/${sessionId}/livekit-token`, { method: 'POST', headers: { Authorization: `Bearer ${outsiderLogin.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(deniedMediaToken.status, 403, 'A student outside the roster must be denied before LiveKit configuration is checked');
  const initialNotes = await request(`/classes/sessions/${sessionId}/notes`, { token: studentLogin.token });
  assert.equal(initialNotes.revision, 0);
  const savedNotes = await request(`/classes/sessions/${sessionId}/notes`, { token: teacherLogin.token, method: 'PUT', body: { content: 'Local smoke lesson notes', revision: 0 } });
  assert.equal(savedNotes.revision, 1, 'Teacher notes should be revisioned and persisted');
  const staleNotes = await fetch(`${base}/api/classes/sessions/${sessionId}/notes`, { method: 'PUT', headers: { Authorization: `Bearer ${teacherLogin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Stale edit', revision: 0 }) });
  assert.equal(staleNotes.status, 409, 'A stale note edit must not overwrite newer notes');
  const studentNotesEdit = await fetch(`${base}/api/classes/sessions/${sessionId}/notes`, { method: 'PUT', headers: { Authorization: `Bearer ${studentLogin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Unauthorized edit', revision: 1 }) });
  assert.equal(studentNotesEdit.status, 403, 'Students may not modify shared notes');

  socket = io(base, { auth: { token: studentLogin.token }, transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('Socket connection timed out')), 8000).unref();
  });
  const joined = await new Promise((resolve) => socket.emit('room:join', { sessionId }, resolve));
  assert.equal(joined.ok, true, `Enrolled student should join live room: ${joined.message || ''}`);
  const chatResult = await new Promise((resolve) => socket.emit('chat:send', { body: 'Local classroom smoke test' }, resolve));
  assert.equal(chatResult.ok, true, 'Chat message should be accepted');
  await socket.disconnect();
  socket = null;
  await new Promise((resolve) => setTimeout(resolve, 500));

  const ended = await request(`/classes/sessions/${sessionId}/end`, { token: teacherLogin.token, method: 'POST', body: { teacherNotes: 'Local smoke test' } });
  assert.equal(ended.session.status, 'ended');
  const report = await request(`/classes/sessions/${sessionId}/report`, { token: teacherLogin.token });
  const attendance = report.session.report.attendance.find((entry) => entry.user === student.id);
  assert.equal(attendance?.attended, true, 'Live room join should be recorded in the attendance report');
  assert.equal((await ClassChatMessage.countDocuments({ session: sessionId })), 1, 'Chat should persist to MongoDB');
  await request(`/classes/sessions/${sessionId}/attendance/${student.id}`, { token: teacherLogin.token, method: 'PATCH', body: { status: 'excused', reason: 'Local smoke audit correction' } });
  const corrected = await request(`/classes/sessions/${sessionId}/report`, { token: teacherLogin.token });
  assert.equal(corrected.session.report.attendance.find((entry) => entry.user === student.id)?.status, 'excused', 'Attendance corrections should persist');
  const pdfResponse = await fetch(`${base}/api/classes/${classId}/report.pdf?sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${teacherLogin.token}` } });
  assert.equal(pdfResponse.status, 200, 'Authorized teacher should be able to download the session PDF');
  assert.match(pdfResponse.headers.get('content-type') || '', /application\/pdf/);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF', 'Attendance export should be a real PDF');
  console.log(`PASS: admin login, teacher/student accounts, class assignment, ${liveKitConfigured ? 'LiveKit token authorization' : 'LiveKit token skipped because credentials are unavailable'}, authorized join, Socket.IO attendance/chat, shared notes revision/security, audited attendance correction, PDF report, and cleanup.`);
} finally {
  socket?.disconnect();
  if (sessionId) await ClassChatMessage.deleteMany({ session: sessionId });
  if (sessionId) await ClassSessionNote.deleteOne({ session: sessionId });
  if (classId) await ClassInvitation.deleteMany({ learningClass: classId });
  if (sessionId) await LiveSession.deleteOne({ _id: sessionId });
  if (classId) await LearningClass.deleteOne({ _id: classId });
  await User.deleteMany({ email: { $in: [teacherEmail, studentEmail, outsiderEmail] } });
  await disconnectDB();
}
