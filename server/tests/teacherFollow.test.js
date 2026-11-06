import assert from 'node:assert/strict';
import test from 'node:test';
import { TeacherFollow } from '../src/models/TeacherFollow.js';

test('teacher follow records require a teacher and follower and enforce one follow per pair', () => {
  const missingIds = new TeacherFollow({});
  assert.ok(missingIds.validateSync());

  const follow = new TeacherFollow({
    teacher: '0123456789abcdef01234567',
    follower: '0123456789abcdef01234568',
  });
  assert.equal(follow.validateSync(), undefined);
  assert.ok(TeacherFollow.schema.indexes().some(([fields, options]) =>
    fields.teacher === 1 && fields.follower === 1 && options.unique === true));
});
