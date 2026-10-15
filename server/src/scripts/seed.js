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
async function seedAdmissions(actor, holding) {
  const owner = actor._id;
  const year = new Date().getFullYear();
  const academicYear = `${year}-${year + 1}`;
  const parentEmail = 'parent.seed@quicklink.local';
  const packTitle = 'Admission requirements — S1 & S4 (Term 1)';

  // A real school record so the seeded pack reflects an actual intake. The
  // requirements below are taken from the school's published new-students flyer.
  const school = await School.create({
    owner,
    holding: holding._id,
    holdingName: holding.name,
    schoolName: 'Ecole des Sciences Saint Louis de Montfort Nyanza',
    district: 'Nyanza',
    dateOfCollection: new Date(),
    trades: { sod: null, nit: null, csa: null, acc: null, other: null },
    teachers: 48,
    recordedBy: owner,
    recordedByName: actor.name,
  });

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
    AdmissionPack.deleteMany({ owner, title: packTitle }),
    Student.deleteMany({ owner, indexNumber: /^QL-SEED/ }),
    User.deleteOne({ email: parentEmail }),
  ]);
  console.log('[seed] Cleared previous admission seed data');

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);

  // Requirements for new S1 & S4 students, Term 1, taken from the school flyer
  // "Babyeyi ya S1 na S4 abanyeshuri bashya" (Ecole des Sciences Saint Louis
  // de Montfort Nyanza).
  const req = (sortOrder, key, fields) => ({ key, appliesTo: {}, sortOrder, ...fields });
  const requirements = [
    req(0, 'proof-of-payment-fees', {
      type: 'required_document',
      category: 'document',
      title: 'Proof of payment — school fees',
      description: 'Bank deposit receipt for the school fees. Cash is not accepted.',
    }),
    req(1, 'proof-of-payment-uniform', {
      type: 'required_document',
      category: 'document',
      title: 'Proof of payment — uniforms',
      description: 'Deposit receipt for the uniform payment (separate account from school fees).',
    }),
    req(2, 'health-insurance', {
      type: 'required_document',
      category: 'document',
      title: 'Health insurance card (Mutuelle / MMI / RAMA)',
      description: 'Bring the learner’s health insurance card.',
    }),
    req(3, 'fees', {
      type: 'payment',
      category: 'payment',
      title: 'School fees — 138,000 RWF (includes insurance and T-shirt)',
      description: 'Deposit into UMWALIMU SACCO account 900012650500.',
      quantity: '138000',
      unit: 'RWF',
      deadline,
    }),
    req(4, 'uniforms', {
      type: 'payment',
      category: 'payment',
      title: 'School uniforms — 24,000 RWF (2 shirts, 2 trousers/skirts)',
      description: 'Deposit into Bank of Kigali account 000860696912343 (Nyanza Investment Group Ltd).',
      quantity: '24000',
      unit: 'RWF',
      deadline,
    }),
    req(5, 'bedcover', {
      type: 'must_bring',
      category: 'boarding',
      title: 'Bedcover — dark blue',
      description: 'Dark blue only.',
      quantity: '1',
    }),
    req(6, 'mosquito-nets', {
      type: 'must_bring',
      category: 'boarding',
      title: 'Mosquito nets (supernet)',
      quantity: '2',
    }),
    req(7, 'bedsheets', {
      type: 'must_bring',
      category: 'boarding',
      title: 'Bedsheets',
      quantity: '2',
      unit: 'pairs',
    }),
    req(8, 'black-shoes', {
      type: 'must_bring',
      category: 'uniform',
      title: 'Closed black shoes',
      description: 'Plain black, no other colour. Only the school-designated black sandals are allowed otherwise.',
      quantity: '1',
      unit: 'pair',
    }),
    req(9, 'white-socks', {
      type: 'must_bring',
      category: 'uniform',
      title: 'White socks',
      quantity: '2',
      unit: 'pairs',
    }),
    req(10, 'sport-kit-s1', {
      type: 'must_bring',
      category: 'uniform',
      title: 'Sport kit — dark blue (S1)',
      description: 'Training top and bottom, short-sleeve shirt and shorts, 2 pairs of black sport shoes. Arrive wearing the sport kit.',
      appliesTo: { levels: ['S1'] },
    }),
    req(11, 'sport-kit-s4', {
      type: 'must_bring',
      category: 'uniform',
      title: 'Sport kit — dark green (S4)',
      description: 'Training top and bottom, short-sleeve shirt and shorts, 2 pairs of black sport shoes. Arrive wearing the sport kit.',
      appliesTo: { levels: ['S4'] },
    }),
    req(12, 'black-sports-shoes', {
      type: 'must_bring',
      category: 'uniform',
      title: 'Black sport shoes',
      quantity: '2',
      unit: 'pairs',
    }),
    req(13, 'black-sandals', {
      type: 'must_bring',
      category: 'uniform',
      title: 'Designated black sandals',
      description: 'Only the school-designated black sandals are allowed.',
      quantity: '1',
      unit: 'pair',
    }),
    req(14, 'exercise-books-200-s1', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Exercise books — 200 pages',
      quantity: '15',
      appliesTo: { levels: ['S1'] },
    }),
    req(15, 'exercise-books-200-s4', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Exercise books — 200 pages',
      quantity: '7',
      appliesTo: { levels: ['S4'] },
    }),
    req(16, 'exercise-books-96', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Exercise books — 96 pages',
      quantity: '5',
    }),
    req(17, 'blue-pens', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Blue pens',
      quantity: '7',
    }),
    req(18, 'red-black-pens', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Red / black pens',
      quantity: '3',
    }),
    req(19, 'registers-s4', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Register books',
      quantity: '4',
      appliesTo: { levels: ['S4'] },
    }),
    req(20, 'math-box', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Mathematical set (mathematical box)',
      quantity: '1',
    }),
    req(21, 'calculator', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Scientific calculator',
      quantity: '1',
    }),
    req(22, 'periodic-table', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Periodic table',
      quantity: '1',
    }),
    req(23, 'lab-coat-s4', {
      type: 'must_bring',
      category: 'uniform',
      title: 'White lab coat',
      quantity: '1',
      appliesTo: { levels: ['S4'] },
    }),
    req(24, 'test-paper', {
      type: 'must_bring',
      category: 'stationery',
      title: 'Test paper',
      quantity: '1',
      unit: 'ream',
    }),
    req(25, 'bible', {
      type: 'must_bring',
      category: 'student',
      title: 'Bible',
      quantity: '1',
    }),
    req(26, 'water-bottle', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Water bottle (gourde)',
      quantity: '1',
    }),
    req(27, 'buckets', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Buckets',
      quantity: '5',
    }),
    req(28, 'toilet-paper', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Toilet paper',
      quantity: '5',
    }),
    req(29, 'towel-oil', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Towel and body oil',
      quantity: '1',
    }),
    req(30, 'handkerchiefs', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'White handkerchiefs',
      quantity: '3',
    }),
    req(31, 'washing-soap', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Washing soap',
      quantity: '4',
      unit: 'bars',
    }),
    req(32, 'bathing-soap', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Bathing soap',
      quantity: '5',
      unit: 'bars',
    }),
    req(33, 'combs', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Combs',
      quantity: '5',
    }),
    req(34, 'panties-cloth', {
      type: 'must_bring',
      category: 'hygiene',
      title: 'Panties and cloth (girls)',
      description: '5 pairs of panties and 1 piece of cloth for girls.',
      quantity: '5',
    }),
  ];

  const pack = new AdmissionPack({
    owner,
    school: school._id,
    schoolName: school.schoolName,
    academicYear,
    title: packTitle,
    levels: ['S1', 'S4'],
    trades: [],
    admissionPeriod: { opensAt: new Date(), closesAt: deadline },
    requirements,
    instructions:
      'Report before 5:00 PM on the reporting day. Motorcycle taxis (bodaboda) are not allowed at school. '
      + 'Only school uniforms and the sport kit are allowed — no other clothing or shoes. Proof of payment for '
      + 'both school fees and uniforms must be brought; cash is not accepted. Learners may not leave for '
      + 'ceremonies (weddings, holidays).',
    contact: {
      name: 'Fr. Egide NIYOMUGABO (Head Teacher)',
      phone: '+250 791 489 490',
      email: 'esclmnyanza@gmail.com',
    },
    paymentInfo: {
      required: true,
      channels: [
        'UMWALIMU SACCO — account 900012650500 (school fees)',
        'Bank of Kigali — account 000860696912343 (uniforms)',
      ],
      reference: 'Learner’s full name',
      instructions:
        'School fees 138,000 RWF (including insurance and T-shirt) are deposited into UMWALIMU SACCO account '
        + '900012650500. Uniforms 24,000 RWF are deposited into Bank of Kigali account 000860696912343 '
        + '(Nyanza Investment Group Ltd). Do not mix the two payments. Bring both receipts; cash is not accepted.',
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
  console.log(`[seed] Published admission pack "${packTitle}" (v1) with ${requirements.length} requirements`);

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
    trade: null,
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
      trade: null,
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
      trade: null,
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

  await seedAdmissions(actor, holdings[0]);

  console.log('[seed] Done');

  await disconnectDB();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
