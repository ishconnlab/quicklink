import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAssignmentRequirements, evaluateAttendanceRequirement } from '../src/services/courseCompletion.js';

const theory = { _id: '0123456789abcdef01234567', type: 'quiz', passMark: 8 };
const practical = { _id: '0123456789abcdef01234568', type: 'practical', passMark: 70 };

test('a passed theory-only assignment does not require an unassigned practical assignment', () => {
  const checks = evaluateAssignmentRequirements(
    [theory],
    [{ assignment: theory._id, attempt: 1, status: 'passed', score: 9 }],
  );
  assert.deepEqual(checks, [{
    key: 'theory',
    label: 'Pass theory assessments',
    complete: true,
    detail: '1 of 1 passed',
  }]);
});

test('theory and practical work are both required when both types are assigned', () => {
  const checks = evaluateAssignmentRequirements(
    [theory, practical],
    [
      { assignment: theory._id, attempt: 1, status: 'passed', score: 9 },
      { assignment: practical._id, attempt: 1, status: 'submitted', score: null },
    ],
  );
  assert.equal(checks.length, 2);
  assert.equal(checks[0].complete, true);
  assert.equal(checks[1].complete, false);
});

test('the latest assignment attempt determines completion', () => {
  const checks = evaluateAssignmentRequirements(
    [theory],
    [
      { assignment: theory._id, attempt: 2, status: 'submitted', score: null },
      { assignment: theory._id, attempt: 1, status: 'passed', score: 10 },
    ],
  );
  assert.equal(checks[0].complete, false);
});

test('no assigned theory or practical work creates no assignment completion check', () => {
  assert.deepEqual(evaluateAssignmentRequirements([], []), []);
});

test('attendance completion requires two sessions, not every session in the course', () => {
  const studentId = '0123456789abcdef01234567';
  const sessions = Array.from({ length: 5 }, (_, index) => ({
    report: {
      attendance: index < 2 ? [{ user: { toString: () => studentId }, attended: true }] : [],
    },
  }));
  assert.deepEqual(evaluateAttendanceRequirement(sessions, studentId), {
    key: 'attendance',
    label: 'Attend at least 2 class sessions',
    complete: true,
    detail: '2 sessions attended (2 required)',
  });
});

test('attendance completion remains incomplete after only one attended session', () => {
  const studentId = '0123456789abcdef01234567';
  assert.equal(evaluateAttendanceRequirement([
    { report: { attendance: [{ user: { toString: () => studentId }, attended: true }] } },
    { report: { attendance: [{ user: { toString: () => studentId }, attended: false }] } },
  ], studentId).complete, false);
});
