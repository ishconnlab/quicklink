import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

let mongod = null;
const TEST_DB = 'quicklink_test';

// Prefer an isolated in-memory MongoDB. If it is unavailable (e.g. the mongod
// binary could not be downloaded), fall back to a dedicated local test database.
export async function setupTestDb() {
  const useMemory = process.env.TEST_USE_MEMORY !== 'false';
  if (useMemory) {
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      await mongoose.connect(mongod.getUri());
      return mongod.getUri();
    } catch (err) {
      console.warn('[tests] In-memory MongoDB unavailable, falling back to local:', err.message);
    }
  }

  const uri =
    process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/${TEST_DB}`;
  await mongoose.connect(uri);
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
  name = 'Test User',
  email = 'owner@test.local',
  password = 'Password123!',
} = {}) {
  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();
  return user;
}

export function makeApp() {
  return createApp();
}
