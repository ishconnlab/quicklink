import assert from 'node:assert/strict';
import test from 'node:test';
import { isLessonAccessible } from '../src/services/lessonAccess.js';

const lessons = [
  { lesson: { _id: 'day-1' } },
  { lesson: { _id: 'day-2' } },
  { lesson: { _id: 'day-3', availableAt: '2027-01-01T00:00:00.000Z' } },
];

test('sequential access opens Day 1 and gates each next lesson on previous completion', () => {
  const completed = new Set();
  assert.equal(isLessonAccessible(lessons[0].lesson, 0, lessons, 'sequential', completed), true);
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'sequential', completed), false);
  completed.add('day-1');
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'sequential', completed), true);
  assert.equal(isLessonAccessible(lessons[2].lesson, 2, lessons, 'sequential', completed), false);
});

test('scheduled access follows availability dates without requiring earlier completion', () => {
  const completed = new Set();
  const now = new Date('2026-11-08T00:00:00.000Z');
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'scheduled', completed, now), true);
  assert.equal(isLessonAccessible(lessons[2].lesson, 2, lessons, 'scheduled', completed, now), false);
  assert.equal(isLessonAccessible(lessons[2].lesson, 2, lessons, 'scheduled', new Set(['day-3']), now), true);
});
