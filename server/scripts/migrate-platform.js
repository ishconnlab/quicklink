import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { TrainingRegistration, normalizedEmail, normalizedPhone } from '../src/models/TrainingRegistration.js';
import { syncAllIndexes } from '../src/models/syncIndexes.js';

async function migrateRoles() {
  const [owners, legacyStudents] = await Promise.all([
    User.updateMany({ role: 'owner' }, { $set: { role: 'admin' } }),
    User.updateMany({ role: 'user' }, { $set: { role: 'student' } }),
  ]);
  return { owners: owners.modifiedCount, legacyStudents: legacyStudents.modifiedCount };
}

async function migrateRegistrations() {
  const cursor = TrainingRegistration.collection.find({});
  let scanned = 0;
  let updated = 0;
  let operations = [];
  const flush = async () => {
    if (!operations.length) return;
    await TrainingRegistration.collection.bulkWrite(operations, { ordered: false });
    operations = [];
  };
  for await (const registration of cursor) {
    scanned += 1;
    const status = registration.status || 'PENDING';
    const email = normalizedEmail(registration.email);
    const phone = normalizedPhone(registration.whatsapp);
    const set = {};
    if (registration.status !== status) set.status = status;
    if (registration.normalizedEmail !== email) set.normalizedEmail = email;
    if (registration.normalizedPhone !== phone) set.normalizedPhone = phone;
    if (!Array.isArray(registration.statusHistory)) {
      set.statusHistory = [{ status, at: registration.createdAt || new Date(), note: 'Status backfilled during migration.' }];
    }
    if (!Object.keys(set).length) continue;
    operations.push({
      updateOne: {
        filter: { _id: registration._id },
        update: { $set: set },
      },
    });
    updated += 1;
    if (operations.length >= 500) await flush();
  }
  await flush();
  return { scanned, updated };
}

async function main() {
  await connectDB();
  try {
    const roles = await migrateRoles();
    const registrations = await migrateRegistrations();
    await syncAllIndexes();
    console.log('[migrate] Role migration:', roles);
    console.log('[migrate] Registration migration:', registrations);
    console.log('[migrate] Indexes synchronized.');
  } finally {
    await disconnectDB();
  }
}

main().catch(async (error) => {
  console.error('[migrate] Failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
