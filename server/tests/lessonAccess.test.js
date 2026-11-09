import assert from 'node:assert/strict';
import test from 'node:test';
import { isLessonAccessible, nextDailyUnlockAt } from '../src/services/lessonAccess.js';

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

test('daily access opens Day 1 and unlocks the next day at 06:00 in the course timezone', () => {
  const completed = new Set();
  const completionTimes = new Map();
  const options = { completionTimes, timeZone: 'Africa/Johannesburg', unlockHour: 6 };
  const now = new Date('2026-11-09T12:00:00.000Z');
  assert.equal(isLessonAccessible(lessons[0].lesson, 0, lessons, 'daily', completed, now, options), true);
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'daily', completed, now, options), false);
  completed.add('day-1');
  completionTimes.set('day-1', new Date('2026-11-09T10:00:00.000Z'));
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'daily', completed, new Date('2026-11-10T03:59:00.000Z'), options), false);
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'daily', completed, new Date('2026-11-10T04:00:00.000Z'), options), true);
});

test('daily access keeps legacy completions without timestamps unlocked sequentially', () => {
  const options = { completionTimes: new Map(), timeZone: 'UTC' };
  assert.equal(isLessonAccessible(lessons[1].lesson, 1, lessons, 'daily', new Set(['day-1']), new Date('2026-11-09T12:00:00.000Z'), options), true);
});

test('next daily unlock is 06:00 on the next calendar day in the supplied timezone', () => {
  assert.equal(nextDailyUnlockAt(new Date('2026-11-09T10:00:00.000Z'), 'UTC').toISOString(), '2026-11-10T06:00:00.000Z');
  assert.equal(nextDailyUnlockAt(new Date('2026-11-09T23:30:00.000Z'), 'Africa/Johannesburg').toISOString(), '2026-11-11T04:00:00.000Z');
});
