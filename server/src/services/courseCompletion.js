import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { LearningBook } from '../models/LearningBook.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LearningAssessmentAttempt } from '../models/LearningAssessmentAttempt.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { LiveSession } from '../models/LiveSession.js';
import { getLearningSettings } from './settings.js';

export const REQUIRED_ATTENDANCE_SESSIONS = 2;

export function evaluateAttendanceRequirement(sessions, studentId) {
  const attended = sessions.filter((session) => session.report?.attendance?.some(
    (record) => record.user?.toString() === studentId.toString() && record.attended,
  )).length;
  return {
    key: 'attendance',
    label: `Attend at least ${REQUIRED_ATTENDANCE_SESSIONS} class sessions`,
    complete: attended >= REQUIRED_ATTENDANCE_SESSIONS,
    detail: `${attended} sessions attended (${REQUIRED_ATTENDANCE_SESSIONS} required)`,
  };
}

export function evaluateAssignmentRequirements(assignments, submissions) {
  const latest = new Map();
  for (const submission of [...submissions].sort((a, b) => b.attempt - a.attempt)) {
    const assignmentId = submission.assignment.toString();
    if (!latest.has(assignmentId)) latest.set(assignmentId, submission);
  }
  const categories = [
    { key: 'theory', label: 'Pass theory assessments', types: new Set(['quiz']) },
    { key: 'practical', label: 'Pass practical assignments', types: new Set(['practical', 'assignment']) },
  ];
  return categories.flatMap(({ key, label, types }) => {
    const required = assignments.filter((assignment) => types.has(assignment.type));
    if (!required.length) return [];
    const completed = required.filter((assignment) => {
      const submission = latest.get(assignment._id.toString());
      return Boolean(submission && (
        submission.status === 'passed'
        || (submission.score !== null && submission.score >= assignment.passMark)
      ));
    });
    return [{
      key,
      label,
      complete: completed.length === required.length,
      detail: `${completed.length} of ${required.length} passed`,
    }];
  });
}

export async function evaluateCourseCompletion(course, studentId) {
  const settings = await getLearningSettings();
  const enrolled = (course.students || []).some((student) => (student._id || student).toString() === studentId.toString());
  const rules = course.completionRequirements || {};
  const certificationAssessmentEnabled = Boolean(course.certificationAssessmentEnabled);
  const assignments = await Assignment.find({
    learningClass: course._id,
    published: true,
    type: { $in: ['quiz', 'practical', 'assignment'] },
  }).select('_id type passMark maxPoints').lean();
  const requirementsConfigured = Boolean(
    rules.requireReading || rules.requireAttendance || rules.minimumScore > 0
    || certificationAssessmentEnabled || assignments.length,
  );
  const checks = [];

  if (certificationAssessmentEnabled) {
    const configured = course.certificationQuestions?.length === 10;
    const passed = configured && await CertificationAssessmentAttempt.exists({ student: studentId, course: course._id, passed: true });
    checks.push({
      key: 'certificationAssessment',
      label: 'Pass the certification assessment',
      complete: Boolean(passed),
      detail: configured ? (passed ? 'Passed (80% required)' : 'Not passed yet (80% required)') : 'The administrator must configure all 10 questions',
    });
  }

  if (rules.requireReading) {
    const ids = (course.learningMaterials || []).map((book) => book._id || book);
    const progress = ids.length ? await LearningProgress.find({ student: studentId, book: { $in: ids } }).select('book completed').lean() : [];
    const done = new Set(progress.filter((item) => item.completed).map((item) => item.book.toString()));
    checks.push({ key: 'reading', label: 'Complete assigned reading', complete: ids.length > 0 && ids.every((book) => done.has(book.toString())), detail: `${done.size} of ${ids.length} materials complete` });
    const [books, passedAttempts] = ids.length ? await Promise.all([
      LearningBook.find({ _id: { $in: ids } }).select('_id assessmentQuestions').lean(),
      LearningAssessmentAttempt.find({ student: studentId, book: { $in: ids }, passed: true }).select('book').lean(),
    ]) : [[], []];
    const configured = new Set(books.filter((book) => (book.assessmentQuestions?.length || 0) > 0).map((book) => book._id.toString()));
    const passed = new Set(passedAttempts.map((attempt) => attempt.book.toString()));
    const passedRequired = ids.filter((book) => configured.has(book.toString()) && passed.has(book.toString())).length;
    const unconfigured = ids.length - configured.size;
    checks.push({
      key: 'readingAssessment',
      label: 'Pass final reading assessments',
      complete: ids.length > 0 && unconfigured === 0 && passedRequired === ids.length,
      detail: unconfigured
        ? `${unconfigured} assessment${unconfigured === 1 ? ' needs' : 's need'} administrator setup; ${passedRequired} of ${ids.length} passed`
        : `${passedRequired} of ${ids.length} passed (${settings.assessmentPassMark}% required)`,
    });
  }

  const submissions = assignments.length ? await AssignmentSubmission.find({
    assignment: { $in: assignments.map((assignment) => assignment._id) },
    student: studentId,
  }).sort({ attempt: -1 }).select('assignment attempt status score').lean() : [];
  checks.push(...evaluateAssignmentRequirements(assignments, submissions));

  if (rules.requireAttendance) {
    const sessions = await LiveSession.find({ learningClass: course._id, status: 'ended' }).select('report.attendance').lean();
    checks.push(evaluateAttendanceRequirement(sessions, studentId));
  }

  if (rules.minimumScore > 0) {
    const assignments = await Assignment.find({ learningClass: course._id, published: true }).select('_id maxPoints').lean();
    const records = assignments.length ? await AssignmentSubmission.find({ assignment: { $in: assignments.map((item) => item._id) }, student: studentId, score: { $ne: null } }).sort({ attempt: -1 }).lean() : [];
    const latest = new Map();
    for (const submission of records) if (!latest.has(submission.assignment.toString())) latest.set(submission.assignment.toString(), submission);
    const scored = assignments.filter((item) => latest.has(item._id.toString()));
    const average = scored.length ? scored.reduce((sum, item) => sum + latest.get(item._id.toString()).score / item.maxPoints * 100, 0) / scored.length : 0;
    checks.push({ key: 'minimumScore', label: `Reach the minimum overall score (${rules.minimumScore}%)`, complete: scored.length > 0 && average >= rules.minimumScore, detail: scored.length ? `Current average ${Math.round(average)}%` : 'No graded work yet' });
  }

  if (!requirementsConfigured) checks.push({ key: 'configuration', label: 'Course completion requirements', complete: false, detail: 'The course has no certificate requirements configured.' });
  const outstanding = [];
  if (!enrolled) outstanding.push('Enroll in this course');
  if (!course.active) outstanding.push('This course is archived');
  if (!requirementsConfigured) outstanding.push('Ask the administrator to configure certificate requirements');
  for (const check of checks) if (!check.complete) outstanding.push(check.detail ? `${check.label}: ${check.detail}` : check.label);
  const eligible = enrolled && course.active && requirementsConfigured && checks.every((check) => check.complete);
  return { eligible, requirementsConfigured, checks, outstanding };
}

export default evaluateCourseCompletion;
