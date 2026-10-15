import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { AdmissionPack } from '../models/AdmissionPack.js';
import { Student } from '../models/Student.js';
import { School } from '../models/School.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  slugKey,
  generateReference,
  generateIndexNumber,
  buildChecklist,
  recordEvent,
} from '../services/admission.js';

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EDITABLE_STATUSES = ['draft', 'incomplete', 'submitted'];

function buildFilter(req) {
  const { search, school, academicYear, status, trade, level } = req.query;
  const filter = { owner: req.user._id };
  if (school) filter.school = school;
  if (academicYear) filter.academicYear = academicYear;
  if (status) filter.status = status;
  if (trade) filter.trade = trade;
  if (level) filter.level = level;
  if (search) {
    const rx = escapeRegex(String(search).trim().toLowerCase());
    filter.$or = [
      { fullNameKey: { $regex: rx } },
      { reference: { $regex: rx, $options: 'i' } },
      { schoolName: { $regex: rx, $options: 'i' } },
      { 'guardian.phone': { $regex: rx, $options: 'i' } },
    ];
  }
  return filter;
}

async function resolveSchool(ownerId, schoolId) {
  const school = await School.findOne({ _id: schoolId, owner: ownerId });
  if (!school) throw ApiError.badRequest('The selected school was not found');
  return school;
}

async function resolvePublishedPack(ownerId, packId, schoolId, academicYear) {
  if (!packId) return { pack: null, version: null, snapshot: null };
  const pack = await AdmissionPack.findOne({ _id: packId, owner: ownerId });
  if (!pack) throw ApiError.badRequest('The selected admission pack was not found');
  if (String(pack.school) !== String(schoolId)) {
    throw ApiError.badRequest('The admission pack belongs to a different school');
  }
  if (pack.status !== 'published' || pack.version < 1) {
    throw ApiError.badRequest('The selected admission pack has not been published yet');
  }
  const snapshot = pack.versionSnapshot(pack.version);
  if (!snapshot) throw ApiError.badRequest('The published pack version could not be loaded');
  return { pack, version: pack.version, snapshot };
}

// Detects a likely duplicate: same school + academic year + learner name, plus
// a matching date of birth or guardian phone.
async function findDuplicate(ownerId, { school, academicYear, fullName, dateOfBirth, guardian }) {
  if (!fullName) return null;
  const fullNameKey = String(fullName).trim().toLowerCase().replace(/\s+/g, ' ');
  const candidates = await AdmissionApplication.find({
    owner: ownerId,
    school,
    academicYear,
    fullNameKey,
    status: { $ne: 'draft' },
  }).limit(5);

  const dobKey = dateOfBirth ? new Date(dateOfBirth).toISOString().slice(0, 10) : null;
  const phone = (guardian?.phone || '').replace(/\D/g, '');

  return (
    candidates.find((c) => {
      const cDob = c.dateOfBirth ? new Date(c.dateOfBirth).toISOString().slice(0, 10) : null;
      const cPhone = (c.guardian?.phone || '').replace(/\D/g, '');
      return (dobKey && cDob && dobKey === cDob) || (phone && cPhone && phone === cPhone);
    }) || null
  );
}

export const listApplications = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const filter = buildFilter(req);

  const [items, total] = await Promise.all([
    AdmissionApplication.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AdmissionApplication.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { applications: items.map((a) => a.toClient()), total, page, limit },
  });
});

export const getApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  res.json({ success: true, data: { application: application.toClient() } });
});

export const createApplication = asyncHandler(async (req, res) => {
  const body = req.body;
  const school = await resolveSchool(req.user._id, body.school);
  const { pack, version, snapshot } = await resolvePublishedPack(
    req.user._id,
    body.admissionPack,
    school._id,
    body.academicYear
  );

  if (!body.confirmDuplicate && body.submit !== false) {
    const duplicate = await findDuplicate(req.user._id, {
      school: school._id,
      academicYear: body.academicYear,
      fullName: body.fullName,
      dateOfBirth: body.dateOfBirth,
      guardian: body.guardian,
    });
    if (duplicate) {
      throw ApiError.conflict('A likely duplicate application already exists for this learner', [
        { path: 'duplicate', message: duplicate.reference, applicationId: duplicate._id.toString() },
      ]);
    }
  }

  const reference = await generateReference(req.user._id);
  const status = body.submit === false ? 'draft' : 'submitted';

  const application = new AdmissionApplication({
    owner: req.user._id,
    school: school._id,
    schoolName: school.schoolName,
    admissionPack: pack ? pack._id : null,
    packVersion: version,
    packSnapshot: snapshot,
    academicYear: body.academicYear,
    reference,
    level: body.level || '',
    trade: body.trade || '',
    studentCategory: body.studentCategory || '',
    firstName: body.firstName || '',
    lastName: body.lastName || '',
    fullName: body.fullName,
    gender: body.gender ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    previousSchool: body.previousSchool || '',
    sponsorship: body.sponsorship || '',
    guardian: body.guardian || {},
    guardian2: body.guardian2 || {},
    documents: (body.documents || []).map((d, i) => ({
      ...d,
      key: d.key || slugKey(d.title || `document-${i + 1}`),
    })),
    status,
    submittedAt: status === 'submitted' ? new Date() : null,
    createdBy: req.user._id,
    clientId: body.clientId || undefined,
  });
  application.recordHistory(status === 'submitted' ? 'submitted' : 'created', {
    by: req.user._id,
    to: status,
  });

  await application.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'application',
    entity: application._id,
    action: status === 'submitted' ? 'submitted' : 'created',
    by: req.user._id,
  });
  res.status(201).json({ success: true, data: { application: application.toClient() } });
});

export const updateApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  if (!EDITABLE_STATUSES.includes(application.status)) {
    throw ApiError.conflict('This application can no longer be edited');
  }

  const body = req.body;
  if (body.school && String(body.school) !== String(application.school)) {
    const school = await resolveSchool(req.user._id, body.school);
    application.school = school._id;
    application.schoolName = school.schoolName;
  }

  if (body.admissionPack !== undefined) {
    const { pack, version, snapshot } = await resolvePublishedPack(
      req.user._id,
      body.admissionPack,
      application.school,
      body.academicYear || application.academicYear
    );
    application.admissionPack = pack ? pack._id : null;
    application.packVersion = version;
    application.packSnapshot = snapshot;
  }

  const assignable = [
    'academicYear',
    'level',
    'trade',
    'studentCategory',
    'firstName',
    'lastName',
    'fullName',
    'gender',
    'dateOfBirth',
    'previousSchool',
    'sponsorship',
    'guardian',
    'guardian2',
  ];
  for (const key of assignable) {
    if (body[key] !== undefined) application[key] = body[key];
  }
  if (body.documents !== undefined) {
    application.documents = body.documents.map((d, i) => ({
      ...d,
      key: d.key || slugKey(d.title || `document-${i + 1}`),
    }));
  }

  await application.save();
  res.json({ success: true, data: { application: application.toClient() } });
});

export const submitApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  if (!['draft', 'incomplete'].includes(application.status)) {
    throw ApiError.conflict('Only draft or incomplete applications can be submitted');
  }
  const from = application.status;
  application.status = 'submitted';
  application.submittedAt = new Date();
  application.recordHistory('submitted', { from, to: 'submitted', by: req.user._id });
  await application.save();
  res.json({ success: true, data: { application: application.toClient() } });
});

export const reviewApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  if (['accepted', 'rejected', 'enrolled'].includes(application.status)) {
    throw ApiError.conflict('This application has already been decided');
  }

  const from = application.status;
  application.status = req.body.status;
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  if (req.body.note) {
    application.reviewerNotes.push({ note: req.body.note, by: req.user._id });
  }
  application.recordHistory('review', {
    from,
    to: req.body.status,
    by: req.user._id,
    note: req.body.note,
  });
  await application.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'application',
    entity: application._id,
    action: 'review',
    by: req.user._id,
    meta: { from, to: req.body.status },
  });
  res.json({ success: true, data: { application: application.toClient() } });
});

export const acceptApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  if (['accepted', 'enrolled'].includes(application.status)) {
    throw ApiError.conflict('This application is already accepted');
  }
  const from = application.status;
  application.status = 'accepted';
  application.reviewedBy = req.user._id;
  application.reviewedAt = new Date();
  if (req.body.note) {
    application.reviewerNotes.push({ note: req.body.note, by: req.user._id });
  }
  application.recordHistory('accepted', { from, to: 'accepted', by: req.user._id });
  await application.save();
  res.json({ success: true, data: { application: application.toClient() } });
});

// Converts an accepted application into an enrolled student. Either links an
// existing Student record or creates exactly one — never a duplicate.
export const enrollApplication = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  if (application.status === 'enrolled') throw ApiError.conflict('Already enrolled');
  if (application.status !== 'accepted') {
    throw ApiError.badRequest('Accept the application before enrolling the learner');
  }

  const body = req.body;
  const school = await resolveSchool(req.user._id, application.school);

  let student;
  if (body.studentId) {
    student = await Student.findOne({ _id: body.studentId, owner: req.user._id });
    if (!student) throw ApiError.badRequest('The selected student record was not found');
  } else {
    const indexNumber = body.indexNumber || (await generateIndexNumber(req.user._id));
    if (body.indexNumber) {
      const taken = await Student.exists({ owner: req.user._id, indexNumber: body.indexNumber });
      if (taken) throw ApiError.conflict('That index number is already in use');
    }
    student = new Student({
      owner: req.user._id,
      school: school._id,
      schoolName: school.schoolName,
      holdingName: school.holdingName,
      district: school.district,
      fullName: application.fullName,
      indexNumber,
      gender: application.gender ?? null,
      dateOfBirth: application.dateOfBirth ?? null,
      trade: body.trade ?? (application.trade || null),
      level: body.level ?? application.level ?? '',
      sponsorship: body.sponsorship ?? (application.sponsorship || null),
      guardianName: application.guardian?.name || '',
      guardianPhone: body.guardianPhone || application.guardian?.phone || '',
      status: 'enrolled',
      enrolledAt: new Date(),
      createdBy: req.user._id,
    });
    await student.save();
  }

  application.student = student._id;
  application.status = 'enrolled';
  application.recordHistory('enrolled', { from: 'accepted', to: 'enrolled', by: req.user._id });
  await application.save();

  const checklist = await buildChecklist({
    application,
    student,
    owner: req.user._id,
  });

  await recordEvent({
    owner: req.user._id,
    entityType: 'application',
    entity: application._id,
    action: 'enrolled',
    by: req.user._id,
    meta: { student: student._id.toString(), checklist: checklist.length },
  });

  res.json({
    success: true,
    data: {
      application: application.toClient(),
      student: student.toClient(),
      checklist: checklist.map((r) => r.toClient()),
    },
  });
});

export const addApplicationNote = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  application.reviewerNotes.push({ note: req.body.note, by: req.user._id });
  application.recordHistory('note', { by: req.user._id, note: req.body.note });
  await application.save();
  res.json({ success: true, data: { application: application.toClient() } });
});

export const verifyDocument = asyncHandler(async (req, res) => {
  const application = await AdmissionApplication.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  const doc = application.documents.id(req.params.docId);
  if (!doc) throw ApiError.notFound('Document not found');
  doc.status = req.body.status;
  doc.note = req.body.note || '';
  if (req.body.status === 'verified') {
    doc.verifiedBy = req.user._id;
    doc.verifiedAt = new Date();
  }
  application.recordHistory('document', {
    by: req.user._id,
    note: `${doc.title || doc.key}: ${req.body.status}`,
  });
  await application.save();
  res.json({ success: true, data: { application: application.toClient() } });
});

export const applicationStats = asyncHandler(async (req, res) => {
  const owner = req.user._id;
  const match = { owner };
  if (req.query.school) match.school = req.query.school;
  if (req.query.academicYear) match.academicYear = req.query.academicYear;

  const rows = await AdmissionApplication.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  res.json({ success: true, data: { total, byStatus } });
});

export const exportApplications = asyncHandler(async (req, res) => {
  const filter = buildFilter(req);
  const applications = await AdmissionApplication.find(filter).sort({
    schoolName: 1,
    fullName: 1,
  });

  const headers = [
    'Reference',
    'Full Name',
    'Gender',
    'Date of Birth',
    'Level',
    'Trade',
    'Academic Year',
    'Status',
    'Guardian',
    'Guardian Phone',
    'School',
    'Submitted',
  ];
  const date = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = applications.map((a) => [
    a.reference,
    a.fullName,
    a.gender || '',
    date(a.dateOfBirth),
    a.level || '',
    a.trade || '',
    a.academicYear,
    a.status,
    a.guardian?.name || '',
    a.guardian?.phone || '',
    a.schoolName,
    date(a.submittedAt),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="admissions-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(`\uFEFF${csv}`);
});

export default {
  listApplications,
  getApplication,
  createApplication,
  updateApplication,
  submitApplication,
  reviewApplication,
  acceptApplication,
  enrollApplication,
  addApplicationNote,
  verifyDocument,
  applicationStats,
  exportApplications,
};
