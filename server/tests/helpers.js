import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { School } from '../src/models/School.js';
import { Holding } from '../src/models/Holding.js';
import { Notification } from '../src/models/Notification.js';
import { Student } from '../src/models/Student.js';

let mongod = null;
const TEST_DB = 'quicklink_test';

// The local test database persists between runs, so stale indexes from older
// schemas can linger. Drop everything and rebuild from the current schema.
async function resetSchema() {
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    School.syncIndexes(),
    Holding.syncIndexes(),
    Student.syncIndexes(),
    Notification.syncIndexes(),
  ]);
}

// Prefer an isolated in-memory MongoDB. If it is unavailable (e.g. the mongod
// binary could not be downloaded), fall back to a dedicated local test database.
export async function setupTestDb() {
  const useMemory = process.env.TEST_USE_MEMORY !== 'false';
  if (useMemory) {
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      await mongoose.connect(mongod.getUri());
      await resetSchema();
      return mongod.getUri();
    } catch (err) {
      console.warn('[tests] In-memory MongoDB unavailable, falling back to local:', err.message);
    }
  }

  // Never reuse the production/online URI for tests; use a dedicated local
  // test database unless TEST_MONGODB_URI is explicitly provided.
  const uri =
    process.env.TEST_MONGODB_URI || `mongodb://127.0.0.1:27017/${TEST_DB}`;
  await mongoose.connect(uri);
  await resetSchema();
  return uri;
}

export async function teardownTestDb() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function createTestUser({
  name = 'Test Owner',
  email = 'owner@test.local',
  password = 'Password123!',
  role = 'owner',
  approvalStatus = 'approved',
} = {}) {
  const user = new User({ name, email, role, approvalStatus });
  await user.setPassword(password);
  await user.save();
  return user;
}

export function makeApp() {
  return createApp();
}
