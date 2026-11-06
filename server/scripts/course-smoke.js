import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import config from '../src/config/env.js';
import connectDB, { disconnectDB } from '../src/config/db.js';
import ensureOwnerAccount from '../src/services/bootstrap.js';
import { User } from '../src/models/User.js';
import { LearningClass } from '../src/models/LearningClass.js';
import { LearningBook } from '../src/models/LearningBook.js';
import { LearningProgress } from '../src/models/LearningProgress.js';
import { Assignment } from '../src/models/Assignment.js';
import { AssignmentSubmission } from '../src/models/AssignmentSubmission.js';
import { CourseCertificate } from '../src/models/CourseCertificate.js';
import { Notification } from '../src/models/Notification.js';

const base = process.env.SMOKE_API_URL || `http://127.0.0.1:${config.port}`;
const unique = randomUUID().replaceAll('-', '');
const password = 'WorkflowSmoke!234';
const teacherEmail = `course-teacher-${unique}@quicklink.local`;
const studentEmail = `course-student-${unique}@quicklink.local`;
const secondEmail = `course-second-${unique}@quicklink.local`;
const managedStudentEmail = `course-managed-${unique}@quicklink.local`;
let ownerId;
let teacherId;
let studentId;
let secondId;
let managedStudentId;
let courseId;
let assignmentId;

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  await connectDB();
  await ensureOwnerAccount();
  const ownerLogin = await request('/auth/login', { method: 'POST', body: { email: config.owner.email, password: config.owner.password } });
  assert.equal(ownerLogin.response.status, 200, 'Configured owner must sign in');
  const ownerToken = ownerLogin.payload.data.token;
  ownerId = ownerLogin.payload.data.user.id;

  for (const [email, name] of [[teacherEmail, 'Workflow teacher']]) {
    const created = await request('/users', { token: ownerToken, method: 'POST', body: { name, email, password, role: 'teacher' } });
    assert.equal(created.response.status, 201, 'Admin can create a teacher account');
    teacherId = created.payload.data.user.id;
  }
  const managedCreate = await request('/users', { token: ownerToken, method: 'POST', body: { name: 'Managed student', email: managedStudentEmail, password, role: 'student', educationLevel: 'L3' } });
  assert.equal(managedCreate.response.status, 201, 'Admin can create a student account');
  managedStudentId = managedCreate.payload.data.user.id;
  assert.equal((await request('/users', { token: ownerToken })).payload.data.users.some((person) => person.id === managedStudentId), true, 'Admin can list managed accounts');
  const deniedPeople = await request('/users', { token: (await request('/auth/login', { method: 'POST', body: { email: managedStudentEmail, password } })).payload.data.token });
  assert.equal(deniedPeople.response.status, 403, 'Students cannot list private account records');
  const updateManaged = await request(`/users/${managedStudentId}`, { token: ownerToken, method: 'PATCH', body: { name: 'Updated managed student', email: `updated-${managedStudentEmail}`, role: 'teacher' } });
  assert.equal(updateManaged.response.status, 200, 'Admin can update a name, email, and role');
  assert.equal(updateManaged.payload.data.user.role, 'teacher');
  assert.equal((await request(`/users/${managedStudentId}`, { token: ownerToken, method: 'PATCH', body: { role: 'student', educationLevel: 'L3' } })).response.status, 200, 'Admin can change an unassigned role');
  const managedLogin = await request('/auth/login', { method: 'POST', body: { email: `updated-${managedStudentEmail}`, password } });
  assert.equal(managedLogin.response.status, 200);
  const registered = await request('/auth/register', { method: 'POST', body: { name: 'Workflow student', email: studentEmail, password, educationLevel: 'L3' } });
  assert.equal(registered.response.status, 202, 'Student registration is submitted for approval');
  studentId = registered.payload.data.user.id;
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: studentEmail, password } })).response.status, 403, 'Pending student cannot sign in');
  const approvedStudent = await request(`/users/${studentId}`, { token: ownerToken, method: 'PATCH', body: { registrationStatus: 'approved' } });
  assert.equal(approvedStudent.response.status, 200, 'Admin can approve student registration');
  const studentLogin = await request('/auth/login', { method: 'POST', body: { email: studentEmail, password } });
  assert.equal(studentLogin.response.status, 200, 'Approved student can sign in');
  const studentToken = studentLogin.payload.data.token;
  const secondRegister = await request('/auth/register', { method: 'POST', body: { name: 'Second student', email: secondEmail, password, educationLevel: 'L3' } });
  assert.equal(secondRegister.response.status, 202, 'A second student registration awaits approval');
  secondId = secondRegister.payload.data.user.id;
  await request(`/users/${secondId}`, { token: ownerToken, method: 'PATCH', body: { registrationStatus: 'approved' } });
  const restored = await request('/auth/me', { token: studentToken });
  assert.equal(restored.response.status, 200, 'The saved bearer session restores the student');
  const secondLogin = await request('/auth/login', { method: 'POST', body: { email: secondEmail, password } });
  assert.equal(secondLogin.response.status, 200, 'Student login succeeds');
  const secondToken = secondLogin.payload.data.token;

  const book = await LearningBook.findOne({ active: true, processingStatus: 'ready' }).select('_id format level').lean();
  assert.ok(book, 'Course workflow smoke requires one published library document');
  const wrongLevelBook = await LearningBook.findOne({ active: true, processingStatus: 'ready', level: { $ne: book.level } }).select('_id level').lean();
  if (wrongLevelBook) {
    const mismatchedMaterial = await request('/classes', { token: ownerToken, method: 'POST', body: { title: `Level mismatch ${unique}`, subject: 'Software Development', level: book.level, teacherId, studentIds: [], learningMaterials: [wrongLevelBook._id.toString()] } });
    assert.equal(mismatchedMaterial.response.status, 400, 'A class cannot link learning materials from a different level');
  }
  const createdCourse = await request('/classes', {
    token: ownerToken, method: 'POST',
    body: {
      title: `Workflow course ${unique}`, introduction: 'Enrollment and practical assessment smoke test',
      subject: 'Software Development', trade: 'Web Development', level: book.level, teacherId,
      studentIds: [], learningMaterials: [book._id.toString()], maxStudents: 1, published: true,
      completionRequirements: { requireReading: true, requirePractical: true },
    },
  });
  assert.equal(createdCourse.response.status, 201, 'Admin can create a published capacity-limited course');
  courseId = createdCourse.payload.data.class.id;
  const assignedRoleChange = await request(`/users/${teacherId}`, { token: ownerToken, method: 'PATCH', body: { role: 'student', educationLevel: 'L3' } });
  assert.equal(assignedRoleChange.response.status, 409, 'Assigned teachers cannot be changed to students before roster removal');

  const browse = await request(`/courses?level=${book.level}&trade=Web%20Development&search=Workflow`, { token: studentToken });
  assert.equal(browse.response.status, 200);
  assert.ok(browse.payload.data.courses.some((item) => item.id === courseId), 'Course search and filters return real catalog data');
  const enrollment = await request(`/courses/${courseId}/enroll`, { token: studentToken, method: 'POST', body: {} });
  assert.equal(enrollment.response.status, 201, 'Student can enroll');
  const dashboardCourses = await request('/courses?enrolled=true', { token: studentToken });
  assert.ok(dashboardCourses.payload.data.courses.some((item) => item.id === courseId), 'Student dashboard can load enrolled courses');
  const duplicate = await request(`/courses/${courseId}/enroll`, { token: studentToken, method: 'POST', body: {} });
  assert.equal(duplicate.response.status, 409, 'Duplicate enrollment is rejected');
  const full = await request(`/courses/${courseId}/enroll`, { token: secondToken, method: 'POST', body: {} });
  assert.equal(full.response.status, 409, 'Course capacity is enforced');

  const progress = await request(`/learning/books/${book._id}/progress`, {
    token: studentToken, method: 'PUT', body: { positionType: book.format === 'pdf' ? 'page' : undefined, currentPage: 19, totalPages: 20, totalUnits: 20, positionIndex: 19, timeSpentSeconds: 30 },
  });
  assert.equal(progress.response.status, 200, 'Enrolled student reading progress is saved');
  assert.equal(progress.payload.data.progress.completed, true, 'Progress completes only at the configured final portion');
  const secondSummaryBefore = await request('/learning/summary', { token: secondToken });
  assert.equal(secondSummaryBefore.payload.data.recentlyRead.some((item) => item.id === book._id.toString()), false, 'A student cannot read another student progress from the summary');
  const secondProgress = await request(`/learning/books/${book._id}/progress`, { token: secondToken, method: 'PUT', body: { currentPage: 1, totalPages: 20, totalUnits: 20, positionIndex: 1 } });
  assert.equal(secondProgress.response.status, 200, 'The second student can only save their own progress');
  assert.equal((await LearningProgress.findOne({ student: studentId, book: book._id }).lean()).positionIndex, 19, 'A second student update leaves the first student progress unchanged');
  assert.equal((await LearningProgress.findOne({ student: secondId, book: book._id }).lean()).positionIndex, 1, 'Each student receives a separate progress record');

  const teacherLogin = await request('/auth/login', { method: 'POST', body: { email: teacherEmail, password } });
  const createdAssignment = await request(`/classes/${courseId}/assignments`, {
    token: teacherLogin.payload.data.token, method: 'POST',
    body: { title: 'Workflow practical', instructions: 'Submit a short implementation note.', type: 'practical', maxPoints: 100, passMark: 50, published: true, submissionTypes: ['text'] },
  });
  assert.equal(createdAssignment.response.status, 201, 'Assigned teacher can publish a practical assignment');
  assignmentId = createdAssignment.payload.data.assignment.id;
  const submission = await request(`/assignments/${assignmentId}/submit`, { token: studentToken, method: 'POST', body: { response: 'Implementation completed.' } });
  assert.equal(submission.response.status, 201, 'Student can submit practical work');
  const selfGrade = await request(`/assignments/submissions/${submission.payload.data.submission.id}/grade`, { token: studentToken, method: 'POST', body: { score: 100, decision: 'passed' } });
  assert.equal(selfGrade.response.status, 403, 'Students cannot grade their own work');
  const grading = await request(`/assignments/submissions/${submission.payload.data.submission.id}/grade`, { token: teacherLogin.payload.data.token, method: 'POST', body: { score: 88, feedback: 'Meets the criteria.', decision: 'passed' } });
  assert.equal(grading.response.status, 200, 'Assigned teacher can grade practical work');

  const completion = await request(`/courses/${courseId}/completion`, { token: studentToken });
  assert.equal(completion.response.status, 200);
  assert.equal(completion.payload.data.eligible, true, 'Reading and practical requirements unlock course completion');
  const certificate = await request(`/courses/${courseId}/certificate`, { token: studentToken, method: 'POST', body: {} });
  assert.equal(certificate.response.status, 201, 'Eligible student can receive a certificate');
  const duplicateCertificate = await request(`/courses/${courseId}/certificate`, { token: studentToken, method: 'POST', body: {} });
  assert.equal(duplicateCertificate.response.status, 201, 'Certificate issuance is idempotent');
  const certificateCode = certificate.payload.data.certificate.code;
  const verified = await request(`/certificates/verify/${certificateCode}`);
  assert.equal(verified.payload.data.valid, true, 'Public certificate verification accepts a valid record');
  const certificatePdf = await fetch(`${base}/api/certificates/${certificate.payload.data.certificate.id}.pdf`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(certificatePdf.status, 200, 'Student can download an earned certificate PDF');
  assert.match(certificatePdf.headers.get('content-type') || '', /application\/pdf/);
  assert.equal(Buffer.from(await certificatePdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF', 'Certificate download contains a real PDF');
  const forbiddenPdf = await request(`/certificates/${certificate.payload.data.certificate.id}.pdf`, { token: secondToken });
  assert.equal(forbiddenPdf.response.status, 403, 'A student cannot download another student certificate');
  const revoked = await request(`/certificates/${certificate.payload.data.certificate.id}/revoke`, { token: ownerToken, method: 'PATCH', body: { reason: 'Smoke test cleanup verification.' } });
  assert.equal(revoked.response.status, 200, 'Admin can revoke an issued certificate');
  const revokedVerification = await request(`/certificates/verify/${certificateCode}`);
  assert.equal(revokedVerification.payload.data.status, 'revoked', 'Public verification reports revoked certificates accurately');

  await LearningClass.updateOne({ _id: courseId }, {
    $set: { teacher: managedStudentId, teachers: [managedStudentId, teacherId] },
    $addToSet: { students: managedStudentId },
  });
  await LearningProgress.create({ student: managedStudentId, book: book._id });
  const removedManaged = await request(`/users/${managedStudentId}`, { token: ownerToken, method: 'DELETE' });
  assert.equal(removedManaged.response.status, 200, 'Admin can permanently delete a managed account');
  assert.equal(removedManaged.payload.data.user.deleted, true);
  assert.equal((await request('/auth/me', { token: managedLogin.payload.data.token })).response.status, 401, 'A permanently deleted account cannot restore an existing session');
  const restoreDeleted = await request(`/users/${managedStudentId}`, { token: ownerToken, method: 'PATCH', body: { isActive: true } });
  assert.equal(restoreDeleted.response.status, 404, 'A permanently deleted account cannot be restored');
  assert.equal(await User.exists({ _id: managedStudentId }), null, 'Permanent deletion removes the account record');
  assert.equal(await LearningProgress.exists({ student: managedStudentId }), null, 'Permanent deletion removes learning progress');
  const updatedClass = await LearningClass.findById(courseId).select('teacher teachers students').lean();
  assert.equal(updatedClass.teacher.toString(), teacherId, 'Permanent deletion reassigns the class to another existing teacher');
  assert.equal(updatedClass.teachers.some((id) => id.toString() === managedStudentId), false, 'Permanent deletion removes deleted teachers from class rosters');
  assert.equal(updatedClass.students.some((id) => id.toString() === managedStudentId), false, 'Permanent deletion removes deleted students from class rosters');

  const loggedOut = await request('/auth/logout', { token: secondToken, method: 'POST', body: {} });
  assert.equal(loggedOut.response.status, 200, 'Student logout invalidates the server session');
  const staleSession = await request('/auth/me', { token: secondToken });
  assert.equal(staleSession.response.status, 401, 'A logged-out token cannot restore a session');
  console.log('PASS: teacher/student account CRUD and access controls, registration/session, course search and capacity-safe enrollment, private reading progress, assignment submission/grading, and certificate eligibility/verification.');
} finally {
  if (courseId) {
    await Promise.all([
      CourseCertificate.deleteMany({ course: courseId }),
      Assignment.deleteMany({ learningClass: courseId }),
      AssignmentSubmission.deleteMany({ learningClass: courseId }),
      LearningClass.deleteOne({ _id: courseId }),
    ]);
  }
  if (studentId || secondId || teacherId || managedStudentId) {
    const ids = [studentId, secondId, teacherId, managedStudentId].filter(Boolean);
    await Promise.all([
      LearningProgress.deleteMany({ student: { $in: ids } }),
      Notification.deleteMany({ user: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
    ]);
  }
  await disconnectDB();
}
