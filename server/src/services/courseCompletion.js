import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { LiveSession } from '../models/LiveSession.js';
import { ProjectSubmission } from '../models/ProjectSubmission.js';
import { getPlatformSettings } from './settings.js';
import { CourseLearningProgress } from '../models/CourseLearningProgress.js';

export const REQUIRED_ATTENDANCE_SESSIONS = 2;

export function evaluateAttendanceRequirement(sessions, studentId, minimum = REQUIRED_ATTENDANCE_SESSIONS) {
  const attended = sessions.filter((session) => session.report?.attendance?.some(
    (record) => record.user?.toString() === studentId.toString() && record.attended,
  )).length;
  return {
    key: 'attendance',
    label: `Attend at least ${minimum} class session${minimum === 1 ? '' : 's'}`,
    complete: attended >= minimum,
    detail: `${attended} session${attended === 1 ? '' : 's'} attended (${minimum} required)`,
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
  const settings = await getPlatformSettings();
  const enrolled = (course.students || []).some((student) => (student._id || student).toString() === studentId.toString());
  const rules = course.completionRequirements || {};
  const assessmentEnabled = Boolean(course.certificationAssessmentEnabled);
  const projectSettings = course.projectSubmission || {};
  const lessonCount = (course.modules || []).reduce((total, module) => total + (module.lessons || []).length, 0);
  const projectRequired = Boolean(projectSettings.enabled && projectSettings.required);
  const attendanceRequired = Boolean(rules.requireAttendance);
  const minimumAttendance = Math.max(1, Number(course.minimumAttendanceSessions || settings.assessment.minimumAttendanceSessions || REQUIRED_ATTENDANCE_SESSIONS));
  const assignments = rules.requireTheory || rules.requirePractical
    ? await Assignment.find({
      learningClass: course._id,
      published: true,
      type: { $in: ['quiz', 'practical', 'assignment'] },
    }).select('_id type passMark maxPoints').lean()
    : [];
  const requirementsConfigured = Boolean(assessmentEnabled || projectRequired || attendanceRequired || assignments.length || rules.minimumScore > 0 || lessonCount > 0);
  const checks = [];

  if (lessonCount) {
    const progress = await CourseLearningProgress.findOne({ student: studentId, course: course._id }).select('completedLessons').lean();
    const lessonIds = new Set((course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => lesson._id?.toString())).filter(Boolean));
    const completed = new Set((progress?.completedLessons || []).map((item) => item.toString()).filter((id) => lessonIds.has(id))).size;
    checks.push({ key: 'lessons', label: 'Complete all course lessons', complete: completed === lessonCount, detail: `${completed} of ${lessonCount} lessons completed` });
  }

  if (assessmentEnabled) {
    const configured = (course.certificationQuestions?.length || 0) > 0;
    const passed = configured && await CertificationAssessmentAttempt.exists({ student: studentId, course: course._id, passed: true });
    checks.push({
      key: 'certificationAssessment',
      label: 'Pass the final certification assessment',
      complete: Boolean(passed),
      detail: configured
        ? (passed ? 'Passed' : `Not passed yet (${course.assessmentPassMark || settings.assessment.passMark}% required)`)
        : 'The administrator must configure the assessment questions',
    });
  }

  if (projectRequired) {
    const submission = await ProjectSubmission.findOne({ learningClass: course._id, student: studentId }).lean();
    checks.push({
      key: 'projectSubmission',
      label: 'Submit your project link and description',
      complete: Boolean(submission),
      detail: submission ? 'Project submitted' : 'No project submission yet',
    });
  }

  if (assignments.length) {
    const submissions = await AssignmentSubmission.find({
      assignment: { $in: assignments.map((assignment) => assignment._id) },
      student: studentId,
    }).sort({ attempt: -1 }).select('assignment attempt status score').lean();
    checks.push(...evaluateAssignmentRequirements(assignments, submissions));
  }

  if (attendanceRequired) {
    const sessions = await LiveSession.find({ learningClass: course._id, status: 'ended' }).select('report.attendance').lean();
    checks.push(evaluateAttendanceRequirement(sessions, studentId, minimumAttendance));
  }

  if (rules.minimumScore > 0) {
    const graded = await Assignment.find({ learningClass: course._id, published: true }).select('_id maxPoints').lean();
    const records = graded.length ? await AssignmentSubmission.find({ assignment: { $in: graded.map((item) => item._id) }, student: studentId, score: { $ne: null } }).sort({ attempt: -1 }).lean() : [];
    const latest = new Map();
    for (const submission of records) if (!latest.has(submission.assignment.toString())) latest.set(submission.assignment.toString(), submission);
    const scored = graded.filter((item) => latest.has(item._id.toString()));
    const average = scored.length ? scored.reduce((sum, item) => sum + latest.get(item._id.toString()).score / item.maxPoints * 100, 0) / scored.length : 0;
    checks.push({ key: 'minimumScore', label: `Reach the minimum overall score (${rules.minimumScore}%)`, complete: scored.length > 0 && average >= rules.minimumScore, detail: scored.length ? `Current average ${Math.round(average)}%` : 'No graded work yet' });
  }

  if (!requirementsConfigured) checks.push({ key: 'configuration', label: 'Certificate requirements', complete: false, detail: 'The training has no certificate requirements configured.' });
  const outstanding = [];
  if (!enrolled) outstanding.push('Enroll in this training');
  if (!course.active) outstanding.push('This training is archived');
  if (!requirementsConfigured) outstanding.push('Ask the administrator to configure certificate requirements');
  for (const check of checks) if (!check.complete) outstanding.push(check.detail ? `${check.label}: ${check.detail}` : check.label);
  const eligible = enrolled && course.active && requirementsConfigured && checks.every((check) => check.complete);
  return { eligible, requirementsConfigured, checks, outstanding };
}

export default evaluateCourseCompletion;
