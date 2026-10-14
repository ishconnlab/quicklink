import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import config from '../config/env.js';
import { User } from '../models/User.js';
import { Holding } from '../models/Holding.js';
import { School } from '../models/School.js';
import ensureOwnerAccount from '../services/bootstrap.js';

const HOLDINGS = [
  { name: 'Northern Education Initiative', description: 'Northern region schools' },
  { name: 'Coastal Learning Project', description: 'Coastal districts programme' },
  { name: 'Digital Skills Expansion', description: 'ICT expansion programme' },
];

const DISTRICTS = ['Central', 'Riverside', 'Northfield', 'Eastgate', 'Hillcrest'];

// Deterministic pseudo-random for reproducible seed data.
function makeRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function seed() {
  await connectDB();
  console.log('[seed] Connected');

  const owner = await ensureOwnerAccount();
  const actor =
    owner || (await User.findOne({}).sort({ createdAt: 1 })) || null;
  if (!actor) {
    console.error('[seed] No user available. Set OWNER_* env vars.');
    process.exit(1);
  }

  // Clear existing collection data for this owner (keeps user accounts).
  await Promise.all([
    School.deleteMany({ owner: actor._id }),
    Holding.deleteMany({ owner: actor._id }),
  ]);
  console.log('[seed] Cleared schools and holdings');

  const holdings = [];
  for (const h of HOLDINGS) {
    holdings.push(
      await Holding.create({
        ...h,
        owner: actor._id,
        nameKey: h.name.toLowerCase().replace(/\s+/g, ' '),
        createdBy: actor._id,
      })
    );
  }
  console.log(`[seed] Created ${holdings.length} holdings`);

  const rand = makeRandom(42);
  const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
  const schools = [];

  for (let hi = 0; hi < holdings.length; hi++) {
    const holding = holdings[hi];
    for (let i = 1; i <= 12; i++) {
      const district = DISTRICTS[int(0, DISTRICTS.length - 1)];
      const collectionDate = new Date();
      collectionDate.setDate(collectionDate.getDate() - int(0, 240));

      // Introduce a few incomplete records (unknown values, not zeros).
      const incomplete = rand() < 0.15;

      schools.push({
        owner: actor._id,
        holding: holding._id,
        holdingName: holding.name,
        schoolName: `${district} Community School ${hi + 1}-${i}`,
        district,
        dateOfCollection: collectionDate,
        trades: {
          sod: incomplete && rand() < 0.5 ? null : int(10, 180),
          nit: int(5, 120),
          csa: incomplete && rand() < 0.5 ? null : int(5, 90),
          acc: int(0, 60),
          other: int(0, 40),
        },
        laptops: incomplete && rand() < 0.5 ? null : int(0, 80),
        teachers: int(3, 45),
        feedback:
          rand() < 0.4
            ? 'The school requires additional laptops and teacher training for the CSA and ACC trades. Power supply is intermittent during afternoon sessions, which limits practical lessons. The head teacher requested follow-up support next term.'
            : '',
        recordedBy: actor._id,
        recordedByName: actor.name,
      });
    }
  }

  const created = await School.insertMany(schools, { ordered: false });
  // insertMany bypasses pre('validate'); recompute totals/flags per record.
  for (const s of created) {
    await s.save();
  }
  console.log(`[seed] Created ${created.length} school records`);

  const total = created.reduce((a, s) => a + (s.totalStudents || 0), 0);
  console.log(`[seed] Total students across records: ${total}`);
  console.log('[seed] Done');

  await disconnectDB();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
