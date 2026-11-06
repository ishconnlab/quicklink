import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Assignment } from '../src/models/Assignment.js';
import { AssignmentSubmission } from '../src/models/AssignmentSubmission.js';
import { ClassInvitation } from '../src/models/ClassInvitation.js';
import { LearningClass } from '../src/models/LearningClass.js';
import { LiveSession } from '../src/models/LiveSession.js';

test('historical class records validate after deleted-user references are cleared', () => {
  const classId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const assignmentId = new mongoose.Types.ObjectId();
  const records = [
    new LearningClass({ title: 'Unassigned class', subject: 'Science', level: 'L3', teacher: null, createdBy: null }),
    new Assignment({ learningClass: classId, createdBy: null, title: 'Preserved class assignment' }),
    new LiveSession({ learningClass: classId, sessionCode: 'deleted-user-test', title: 'Saved session', startedBy: null }),
    new ClassInvitation({ learningClass: classId, student: userId, email: 'student@example.test', sentBy: null }),
    new AssignmentSubmission({
      assignment: assignmentId,
      learningClass: classId,
      student: userId,
      attempt: 1,
      gradingHistory: [{ score: 1, status: 'graded', gradedBy: null }],
    }),
  ];

  for (const record of records) assert.equal(record.validateSync(), undefined);
});
