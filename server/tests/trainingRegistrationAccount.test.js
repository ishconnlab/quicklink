import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { TrainingRegistration } from '../src/models/TrainingRegistration.js';
import { User } from '../src/models/User.js';
import { createUserSchema, registerSchema } from '../src/utils/validators.js';

test('student accounts accept bootcamp and training education levels', () => {
  for (const educationLevel of ['Bootcamp', 'Training']) {
    const user = new User({
      name: 'Training Student',
      email: `${educationLevel.toLowerCase()}@example.test`,
      passwordHash: 'test-hash',
      educationLevel,
      role: 'student',
    });
    assert.equal(user.validateSync(), undefined);
    assert.equal(registerSchema.safeParse({ name: 'Training Student', email: 'student@example.test', password: 'valid-password', educationLevel }).success, true);
    assert.equal(createUserSchema.safeParse({ name: 'Training Student', email: 'student@example.test', password: 'valid-password', role: 'student', educationLevel }).success, true);
  }
});

test('training registrations can store expiring, non-public account claim data', () => {
  const registration = new TrainingRegistration({
    form: new mongoose.Types.ObjectId(),
    name: 'Training Student',
    email: 'student@example.test',
    whatsapp: '+27123456789',
    accountClaimTokenHash: 'a'.repeat(64),
    accountClaimExpiresAt: new Date(Date.now() + 60_000),
    accountSetupTokenHash: 'c'.repeat(64),
    accountSetupExpiresAt: new Date(Date.now() + 60_000),
    pendingAccountEducationLevel: 'Bootcamp',
  });
  assert.equal(registration.validateSync(), undefined);
});
