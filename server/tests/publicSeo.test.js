import test from 'node:test';
import assert from 'node:assert/strict';
import { programmeSlug } from '../src/controllers/publicSeoController.js';

test('public programme slugs are readable, normalized, and unique by training id', () => {
  const training = { title: 'Python & Machine Learning: Kigali Cohort', _id: '0123456789abcdef01234567' };
  assert.equal(programmeSlug(training), 'python-machine-learning-kigali-cohort-0123456789abcdef01234567');
  assert.notEqual(programmeSlug(training), programmeSlug({ ...training, _id: '1123456789abcdef01234567' }));
});
