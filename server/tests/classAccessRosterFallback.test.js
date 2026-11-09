import assert from 'node:assert/strict';
import test from 'node:test';
import { Enrollment } from '../src/models/Enrollment.js';
import { assertCanAttend } from '../src/services/classAccess.js';

const userId = '0123456789abcdef01234567';

test('rostered learners without an enrollment record retain access to free classes', async () => {
  const originalFindOne = Enrollment.findOne;
  Enrollment.findOne = () => Promise.resolve(null);
  try {
    const state = await assertCanAttend(
      { _id: '1123456789abcdef01234567', students: [userId], payment: { enabled: false } },
      { _id: userId, role: 'student' },
    );
    assert.equal(state.allowed, true);
    assert.equal(state.status, 'not_required');
  } finally {
    Enrollment.findOne = originalFindOne;
  }
});

test('rostered learners without an enrollment record still obey paid-class grace periods', async () => {
  const originalFindOne = Enrollment.findOne;
  Enrollment.findOne = () => Promise.resolve(null);
  try {
    await assert.rejects(
      assertCanAttend(
        {
          _id: '1123456789abcdef01234567',
          students: [userId],
          payment: { enabled: true, freeDays: 0 },
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        { _id: userId, role: 'student' },
      ),
      (error) => error.statusCode === 409 && error.details?.code === 'PAYMENT_REQUIRED',
    );
  } finally {
    Enrollment.findOne = originalFindOne;
  }
});

test('learners outside the roster and without an enrollment record are denied', async () => {
  const originalFindOne = Enrollment.findOne;
  Enrollment.findOne = () => Promise.resolve(null);
  try {
    await assert.rejects(
      assertCanAttend(
        { _id: '1123456789abcdef01234567', students: [], payment: { enabled: false } },
        { _id: userId, role: 'student' },
      ),
      (error) => error.statusCode === 403,
    );
  } finally {
    Enrollment.findOne = originalFindOne;
  }
});
