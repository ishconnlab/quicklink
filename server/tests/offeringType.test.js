import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningClass } from '../src/models/LearningClass.js';
import { paymentState } from '../src/services/classAccess.js';

test('existing offerings default to training and new self-paced courses are explicitly typed', () => {
  const legacyTraining = new LearningClass({ title: 'Legacy', subject: 'General' });
  const course = new LearningClass({ title: 'Course', subject: 'General', offeringType: 'course' });

  assert.equal(legacyTraining.offeringType, 'training');
  assert.equal(course.offeringType, 'course');
});

test('paid courses have no free access period by default', () => {
  const state = paymentState(
    { payment: { enabled: true, freeDays: 0 }, createdAt: new Date('2026-01-01T00:00:00Z') },
    { paymentStatus: 'unpaid', enrolledAt: new Date('2026-01-01T00:00:00Z') },
    new Date('2026-01-01T00:00:01Z'),
  );

  assert.equal(state.allowed, false);
  assert.equal(state.freeDays, 0);
});
