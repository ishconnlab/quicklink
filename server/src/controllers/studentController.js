import { Student } from '../models/Student.js';
import { School } from '../models/School.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const TRADE_LABELS = { sod: 'SOD', nit: 'NIT', csa: 'CSA', acc: 'ACC', other: 'Other' };
const STATUS_LABELS = {
  enrolled: 'Enrolled',
  graduated: 'Graduated',
  transferred: 'Transferred',
  dropped: 'Dropped',
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// All queries are scoped to the authenticated account (multi-tenant).
function buildFilter(req) {
  const { search, school, trade, status, level, district } = req.query;
  const filter = { owner: req.user._id };
  if (school) filter.school = school;
  if (trade) filter.trade = trade;
  if (status) filter.status = status;
  if (level) filter.level = level;
  if (district) filter.district = district;
  if (search) {
    const rx = escapeRegex(String(search).trim().toLowerCase());
    filter.$or = [
      { fullNameKey: { $regex: rx } },
      { indexNumber: { $regex: rx, $options: 'i' } },
      { schoolName: { $regex: rx, $options: 'i' } },
    ];
  }
  return filter;
}

async function resolveSchool(ownerId, schoolId) {
  const school = await School.findOne({ _id: schoolId, owner: ownerId });
  if (!school) throw ApiError.badRequest('The selected school was not found');
  return school;
}

// Auto-allocates a candidate index number when none is supplied. A supplied
// number must be unique within the account.
async function resolveIndexNumber(ownerId, requested) {
  const year = new Date().getFullYear();
  if (requested) {
    const exists = await Student.exists({ owner: ownerId, indexNumber: requested });
    if (exists) throw ApiError.conflict('That index number is already in use');
    return requested;
  }
  for (let i = 0; i < 8; i += 1) {
    const candidate = `QL-${year}-${Math.floor(10000 + Math.random() * 90000)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Student.exists({ owner: ownerId, indexNumber: candidate });
    if (!exists) return candidate;
  }
  throw ApiError.conflict('Could not allocate a unique index number, please try again');
}

export const listStudents = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const filter = buildFilter(req);

  const [items, total] = await Promise.all([
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Student.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { students: items.map((s) => s.toClient()), total, page, limit },
  });
});

export const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, owner: req.user._id });
  if (!student) throw ApiError.notFound('Student not found');
  res.json({ success: true, data: { student: student.toClient() } });
});

export const createStudent = asyncHandler(async (req, res) => {
  const body = req.body;
  const school = await resolveSchool(req.user._id, body.school);
  const indexNumber = await resolveIndexNumber(req.user._id, body.indexNumber || null);

  const student = new Student({
    owner: req.user._id,
    school: school._id,
    schoolName: school.schoolName,
    holdingName: school.holdingName,
    district: school.district,
    fullName: body.fullName,
    indexNumber,
    gender: body.gender ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    trade: body.trade ?? null,
    level: body.level || '',
    sponsorship: body.sponsorship ?? null,
    guardianName: body.guardianName || '',
    guardianPhone: body.guardianPhone || '',
    status: body.status || 'enrolled',
    enrolledAt: body.enrolledAt || new Date(),
    notes: body.notes || '',
    clientId: body.clientId || undefined,
    createdBy: req.user._id,
  });

  await student.save();
  res.status(201).json({ success: true, data: { student: student.toClient() } });
});

export const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, owner: req.user._id });
  if (!student) throw ApiError.notFound('Student not found');

  const body = req.body;

  if (body.school && String(body.school) !== String(student.school)) {
    const school = await resolveSchool(req.user._id, body.school);
    student.school = school._id;
    student.schoolName = school.schoolName;
    student.holdingName = school.holdingName;
    student.district = school.district;
  }

  if (body.indexNumber !== undefined && body.indexNumber !== null) {
    if (body.indexNumber !== student.indexNumber) {
      const exists = await Student.exists({
        owner: req.user._id,
        indexNumber: body.indexNumber,
        _id: { $ne: student._id },
      });
      if (exists) throw ApiError.conflict('That index number is already in use');
      student.indexNumber = body.indexNumber;
    }
  }

  const assignable = [
    'fullName',
    'gender',
    'dateOfBirth',
    'trade',
    'level',
    'sponsorship',
    'guardianName',
    'guardianPhone',
    'status',
    'enrolledAt',
    'notes',
  ];
  for (const key of assignable) {
    if (body[key] !== undefined) student[key] = body[key];
  }

  await student.save();
  res.json({ success: true, data: { student: student.toClient() } });
});

export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!student) throw ApiError.notFound('Student not found');
  res.json({ success: true, data: { message: 'Student removed' } });
});

// Learner insights, mirroring RTB's TVET Data Management Platform dashboards.
export const studentStats = asyncHandler(async (req, res) => {
  const owner = req.user._id;

  const [total, certificationReady, byTrade, byStatus, byGender, byLevel] = await Promise.all([
    Student.countDocuments({ owner }),
    Student.countDocuments({
      owner,
      status: 'enrolled',
      indexNumber: { $type: 'string' },
      trade: { $ne: null },
      level: { $nin: [null, ''] },
    }),
    Student.aggregate([{ $match: { owner } }, { $group: { _id: '$trade', count: { $sum: 1 } } }]),
    Student.aggregate([{ $match: { owner } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Student.aggregate([{ $match: { owner } }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
    Student.aggregate([{ $match: { owner } }, { $group: { _id: '$level', count: { $sum: 1 } } }]),
  ]);

  const toMap = (rows) =>
    rows.reduce((acc, row) => {
      acc[row._id || 'unset'] = row.count;
      return acc;
    }, {});

  res.json({
    success: true,
    data: {
      total,
      certificationReady,
      byTrade: toMap(byTrade),
      byStatus: toMap(byStatus),
      byGender: toMap(byGender),
      byLevel: toMap(byLevel),
    },
  });
});

// Export the account's students as a certification/registration register (CSV).
export const exportStudents = asyncHandler(async (req, res) => {
  const filter = buildFilter(req);
  const students = await Student.find(filter).sort({ schoolName: 1, fullName: 1 });

  const headers = [
    'Index Number',
    'Full Name',
    'Gender',
    'Date of Birth',
    'Trade',
    'Level',
    'Sponsorship',
    'Status',
    'Certification Ready',
    'School',
    'District',
    'Guardian',
    'Guardian Phone',
  ];

  const date = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = students.map((s) => [
    s.indexNumber,
    s.fullName,
    s.gender || '',
    date(s.dateOfBirth),
    s.trade ? TRADE_LABELS[s.trade] || s.trade : '',
    s.level || '',
    s.sponsorship || '',
    STATUS_LABELS[s.status] || s.status,
    s.isCertificationReady() ? 'Yes' : 'No',
    s.schoolName,
    s.district,
    s.guardianName,
    s.guardianPhone,
  ]);

  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="student-register-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(`\uFEFF${csv}`);
});

export default {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  studentStats,
  exportStudents,
};
