import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { TrainingRegistration } from '../src/models/TrainingRegistration.js';
import { User } from '../src/models/User.js';
import { createUserSchema, registerSchema } from '../src/utils/validators.js';

test('student accounts preserve legacy education levels while account creation ignores them', () => {
  for (const educationLevel of ['Bootcamp', 'Training']) {
    const user = new User({
      name: 'Training Student',
      email: `${educationLevel.toLowerCase()}@example.test`,
      passwordHash: 'test-hash',
      educationLevel,
      role: 'student',
    });
    assert.equal(user.validateSync(), undefined);
  }
  const registration = registerSchema.safeParse({
    name: 'Training Student',
    email: 'student@example.test',
    whatsapp: '+27123456789',
    country: 'South Africa',
    province: 'Gauteng',
    password: 'valid-password',
    educationLevel: 'Bootcamp',
  });
  assert.equal(registration.success, true);
  assert.equal('educationLevel' in registration.data, false);
  const created = createUserSchema.safeParse({
    name: 'Training Student',
    email: 'student@example.test',
    password: 'valid-password',
    role: 'admin',
    educationLevel: 'Training',
  });
  assert.equal(created.success, true);
  assert.equal('educationLevel' in created.data, false);
  assert.equal('role' in created.data, false);
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
