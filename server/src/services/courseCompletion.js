import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { LearningBook } from '../models/LearningBook.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LearningAssessmentAttempt } from '../models/LearningAssessmentAttempt.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { LiveSession } from '../models/LiveSession.js';

export async function evaluateCourseCompletion(course, studentId) {
  const enrolled = (course.students || []).some((student) => (student._id || student).toString() === studentId.toString());
  const rules = course.completionRequirements || {};
  const certificationAssessmentEnabled = Boolean(course.certificationAssessmentEnabled);
  const requirementsConfigured = Boolean(rules.requireReading || rules.requireTheory || rules.requirePractical || rules.requireAttendance || rules.minimumScore > 0 || certificationAssessmentEnabled);
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
    const configured = new Set(books.filter((book) => book.assessmentQuestions?.length === 20).map((book) => book._id.toString()));
    const passed = new Set(passedAttempts.map((attempt) => attempt.book.toString()));
    const passedRequired = ids.filter((book) => configured.has(book.toString()) && passed.has(book.toString())).length;
    const unconfigured = ids.length - configured.size;
    checks.push({
      key: 'readingAssessment',
      label: 'Pass final reading assessments',
      complete: ids.length > 0 && unconfigured === 0 && passedRequired === ids.length,
      detail: unconfigured
        ? `${unconfigured} assessment${unconfigured === 1 ? ' needs' : 's need'} administrator setup; ${passedRequired} of ${ids.length} passed`
        : `${passedRequired} of ${ids.length} passed (80% required)`,
    });
  }

  const assignmentTypes = [];
  if (rules.requireTheory) assignmentTypes.push(['theory', ['quiz']]);
  if (rules.requirePractical) assignmentTypes.push(['practical', ['practical', 'assignment']]);
  for (const [key, types] of assignmentTypes) {
    const assignments = await Assignment.find({ learningClass: course._id, published: true, type: { $in: types } }).select('title passMark maxPoints').lean();
    const submissions = assignments.length ? await AssignmentSubmission.find({ assignment: { $in: assignments.map((assignment) => assignment._id) }, student: studentId }).sort({ attempt: -1 }).lean() : [];
    const latest = new Map();
    for (const submission of submissions) if (!latest.has(submission.assignment.toString())) latest.set(submission.assignment.toString(), submission);
    const completed = assignments.filter((assignment) => {
      const submission = latest.get(assignment._id.toString());
      return Boolean(submission && (submission.status === 'passed' || (submission.score !== null && submission.score >= assignment.passMark)));
    });
    checks.push({ key, label: key === 'theory' ? 'Pass theory assessments' : 'Pass practical assignments', complete: assignments.length > 0 && completed.length === assignments.length, detail: `${completed.length} of ${assignments.length} passed` });
  }

  if (rules.requireAttendance) {
    const sessions = await LiveSession.find({ learningClass: course._id, status: 'ended' }).select('report.attendance').lean();
    const attended = sessions.filter((session) => session.report?.attendance?.some((record) => record.user?.toString() === studentId.toString() && record.attended)).length;
    checks.push({ key: 'attendance', label: 'Attend required class sessions', complete: sessions.length > 0 && attended === sessions.length, detail: `${attended} of ${sessions.length} sessions attended` });
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
