import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB, { disconnectDB } from '../config/db.js';
import config from '../config/env.js';
import { User } from '../models/User.js';
import { Holding } from '../models/Holding.js';
import { School } from '../models/School.js';
import { AdmissionPack } from '../models/AdmissionPack.js';
import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { Student } from '../models/Student.js';
import { StudentRequirement } from '../models/StudentRequirement.js';
import { GuardianInvitation, GuardianLink } from '../models/Guardian.js';
import { Conversation, Message } from '../models/Conversation.js';
import { buildChecklist } from '../services/admission.js';
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

// Seed data for the admission, parent-portal and messaging features. Records are
// tagged with stable markers (indexNumber `QL-SEED-*`, reference `ADM-SEED-*`,
// a fixed pack title and the parent email) so re-seeding only replaces its own
// records and never touches real data.
async function seedAdmissions(actor, school) {
  const owner = actor._id;
  const year = new Date().getFullYear();
  const academicYear = `${year}-${year + 1}`;
  const parentEmail = 'parent.seed@quicklink.local';

  const seedStudentIds = (
    await Student.find({ owner, indexNumber: /^QL-SEED/ }).select('_id')
  ).map((s) => s._id);
  const seedConvIds = (
    await Conversation.find({ owner, student: { $in: seedStudentIds } }).select('_id')
  ).map((c) => c._id);

  await Promise.all([
    StudentRequirement.deleteMany({ owner, student: { $in: seedStudentIds } }),
    GuardianLink.deleteMany({ owner, student: { $in: seedStudentIds } }),
    GuardianInvitation.deleteMany({ owner, student: { $in: seedStudentIds } }),
    Message.deleteMany({ owner, conversation: { $in: seedConvIds } }),
    Conversation.deleteMany({ owner, student: { $in: seedStudentIds } }),
    AdmissionApplication.deleteMany({ owner, reference: /^ADM-SEED/ }),
    AdmissionPack.deleteMany({ owner, title: 'Seed Admission Pack' }),
    Student.deleteMany({ owner, indexNumber: /^QL-SEED/ }),
    User.deleteOne({ email: parentEmail }),
  ]);
  console.log('[seed] Cleared previous admission seed data');

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);

  const requirements = [
    {
      key: 'birth-certificate',
      type: 'required_document',
      category: 'document',
      title: 'Birth certificate (copy)',
      description: 'Certified copy of the learner’s birth certificate.',
      appliesTo: {},
      sortOrder: 0,
    },
    {
      key: 'primary-certificate',
      type: 'required_document',
      category: 'document',
      title: 'Primary leaving certificate or equivalent',
      description: 'Result slip or certificate from the previous school.',
      appliesTo: {},
      sortOrder: 1,
    },
    {
      key: 'school-uniform',
      type: 'must_bring',
      category: 'uniform',
      title: 'School uniform',
      quantity: '2',
      unit: 'sets',
      appliesTo: {},
      sortOrder: 2,
    },
    {
      key: 'exercise-books',
      type: 'must_bring',
      category: 'stationery',
      title: 'Exercise books',
      quantity: '10',
      unit: 'books',
      appliesTo: {},
      sortOrder: 3,
    },
    {
      key: 'safety-boots',
      type: 'school_provides',
      category: 'tools',
      title: 'Safety boots and overalls',
      description: 'Provided by the school for practical workshops.',
      appliesTo: { trades: ['csa', 'acc'] },
      sortOrder: 4,
    },
    {
      key: 'toiletries',
      type: 'optional',
      category: 'hygiene',
      title: 'Personal toiletries',
      appliesTo: {},
      sortOrder: 5,
    },
    {
      key: 'fees-term1',
      type: 'payment',
      category: 'payment',
      title: 'Term 1 contribution',
      description: 'Paid at the school bursar’s office.',
      deadline,
      appliesTo: {},
      sortOrder: 6,
    },
  ];

  const pack = new AdmissionPack({
    owner,
    school: school._id,
    schoolName: school.schoolName,
    academicYear,
    title: 'Seed Admission Pack',
    levels: ['S1', 'S2', 'S3'],
    trades: ['sod', 'csa', 'acc'],
    admissionPeriod: { opensAt: new Date(), closesAt: deadline },
    requirements,
    instructions:
      'Report to the school office with all required documents on the reporting date.',
    contact: { name: 'Admissions Office', phone: '+250 788 000 000', email: 'admissions@example.rw' },
    paymentInfo: {
      required: true,
      channels: ['bank', 'mobile_money'],
      instructions: 'Use the learner’s reference as the payment reference.',
    },
    status: 'draft',
    createdBy: owner,
  });
  await pack.save();

  const version = pack.version + 1;
  const snapshot = pack.buildSnapshot();
  snapshot.version = version;
  pack.versions.push({ version, snapshot, publishedAt: new Date(), publishedBy: owner });
  pack.version = version;
  pack.status = 'published';
  pack.publishedAt = new Date();
  pack.publishedBy = owner;
  await pack.save();
  console.log('[seed] Published admission pack (v1) with 7 requirements');

  const makeApplication = (overrides) =>
    new AdmissionApplication({
      owner,
      school: school._id,
      schoolName: school.schoolName,
      admissionPack: pack._id,
      packVersion: version,
      packSnapshot: snapshot,
      academicYear,
      createdBy: owner,
      ...overrides,
    });

  // 1) A newly submitted application awaiting review.
  const submitted = makeApplication({
    reference: 'ADM-SEED-0001',
    fullName: 'Seed Applicant',
    firstName: 'Seed',
    lastName: 'Applicant',
    gender: 'female',
    dateOfBirth: new Date('2010-04-12'),
    level: 'S1',
    trade: 'csa',
    previousSchool: 'Sunrise Primary School',
    guardian: { name: 'Seed Parent', relationship: 'mother', phone: '+250788111222' },
    status: 'submitted',
    submittedAt: new Date(),
  });
  await submitted.save();

  // A parent account used to exercise the parent portal and messaging.
  const parent = new User({
    name: 'Seed Parent',
    email: parentEmail,
    role: 'parent',
    approvalStatus: 'approved',
    isActive: true,
  });
  await parent.setPassword('Parent123!');
  await parent.save();

  const enrolledLearner = async (ref, fullName, indexNumber, linkParent) => {
    const application = makeApplication({
      reference: ref,
      fullName,
      gender: 'male',
      level: 'S1',
      trade: 'csa',
      guardian: { name: 'Seed Parent', relationship: 'mother', phone: '+250788111222' },
      status: 'accepted',
      submittedAt: new Date(),
      reviewedBy: owner,
      reviewedAt: new Date(),
    });
    application.recordHistory('submitted', { to: 'submitted', by: owner });
    application.recordHistory('accepted', { from: 'submitted', to: 'accepted', by: owner });
    await application.save();

    const student = await Student.create({
      owner,
      school: school._id,
      schoolName: school.schoolName,
      holdingName: school.holdingName,
      district: school.district,
      fullName,
      indexNumber,
      gender: 'male',
      trade: 'csa',
      level: 'S1',
      status: 'enrolled',
      enrolledAt: new Date(),
      createdBy: owner,
    });

    application.student = student._id;
    application.status = 'enrolled';
    application.recordHistory('enrolled', { from: 'accepted', to: 'enrolled', by: owner });
    await application.save();

    await buildChecklist({ application, student, owner });
    await StudentRequirement.updateMany(
      { owner, student: student._id, requiresVerification: false },
      { $set: { parentStatus: 'preparing' } }
    );

    if (linkParent) {
      await GuardianLink.create({
        owner,
        school: school._id,
        student: student._id,
        user: parent._id,
        relationship: 'mother',
        status: 'approved',
        createdBy: owner,
        approvedBy: owner,
        approvedAt: new Date(),
      });
    }
    return { application, student };
  };

  const { student: learnerA } = await enrolledLearner(
    'ADM-SEED-0002',
    'Seed Enrolled Learner',
    'QL-SEED-0001',
    true
  );

  const { student: learnerB } = await enrolledLearner(
    'ADM-SEED-0003',
    'Seed Second Learner',
    'QL-SEED-0002',
    false
  );

  // Pending invitation for the second learner (raw token only exists here).
  const rawToken = crypto.randomBytes(24).toString('hex');
  const invitation = await GuardianInvitation.create({
    owner,
    school: school._id,
    student: learnerB._id,
    contact: { name: 'Seed Parent', relationship: 'mother', phone: '+250788111222' },
    tokenHash: GuardianInvitation.hashToken(rawToken),
    tokenPrefix: rawToken.slice(0, 8),
    status: 'pending',
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdBy: owner,
  });

  // School <-> parent conversation for the first learner.
  const conversation = await Conversation.create({
    owner,
    school: school._id,
    student: learnerA._id,
    participants: [owner, parent._id],
    subject: 'Welcome to QuickLink',
    createdBy: owner,
    lastMessageAt: new Date(),
    lastMessagePreview: 'Thank you for connecting. We look forward to a great term.',
  });
  await Message.create([
    {
      owner,
      conversation: conversation._id,
      sender: owner,
      senderRole: 'staff',
      body: 'Hello, your child’s admission requirements are ready in QuickLink. Please review them.',
      readBy: [owner],
    },
    {
      owner,
      conversation: conversation._id,
      sender: parent._id,
      senderRole: 'parent',
      body: 'Thank you for connecting. We look forward to a great term.',
      readBy: [parent._id],
    },
  ]);

  console.log('[seed] Created 3 applications (1 submitted, 2 enrolled)');
  console.log('[seed] Created 2 learners with checklists + 1 approved parent link');
  console.log('[seed] Created 1 conversation with messages');
  console.log(`[seed] Parent login: ${parentEmail} / Parent123!`);
  console.log(
    `[seed] Guardian invite token for ${learnerB.fullName}: /connect?token=${rawToken} (id ${invitation._id})`
  );
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

  await seedAdmissions(actor, created[0]);

  console.log('[seed] Done');

  await disconnectDB();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
