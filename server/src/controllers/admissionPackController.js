import { AdmissionPack } from '../models/AdmissionPack.js';
import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { StudentRequirement } from '../models/StudentRequirement.js';
import { School } from '../models/School.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { slugKey, recordEvent } from '../services/admission.js';

async function resolveSchool(ownerId, schoolId) {
  const school = await School.findOne({ _id: schoolId, owner: ownerId });
  if (!school) throw ApiError.badRequest('The selected school was not found');
  return school;
}

// Ensures every requirement has a unique, stable key within the pack.
function normalizeRequirements(requirements = []) {
  const used = new Set();
  return requirements.map((r, index) => {
    const base = r.key && String(r.key).trim() ? slugKey(r.key) : slugKey(r.title, `item-${index + 1}`);
    let key = base;
    let n = 1;
    while (used.has(key)) {
      n += 1;
      key = `${base}-${n}`;
    }
    used.add(key);
    return { ...r, key, sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : index };
  });
}

export const listPacks = asyncHandler(async (req, res) => {
  const { school, academicYear, status } = req.query;
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);

  const filter = { owner: req.user._id };
  if (school) filter.school = school;
  if (academicYear) filter.academicYear = academicYear;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    AdmissionPack.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AdmissionPack.countDocuments(filter),
  ]);

  res.json({ success: true, data: { packs: items.map((p) => p.toClient()), total, page, limit } });
});

export const getPack = asyncHandler(async (req, res) => {
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pack) throw ApiError.notFound('Admission pack not found');
  res.json({ success: true, data: { pack: pack.toClient() } });
});

export const createPack = asyncHandler(async (req, res) => {
  const body = req.body;
  const school = await resolveSchool(req.user._id, body.school);

  const pack = new AdmissionPack({
    owner: req.user._id,
    school: school._id,
    schoolName: school.schoolName,
    academicYear: body.academicYear,
    title: body.title || '',
    admissionPeriod: body.admissionPeriod || {},
    levels: body.levels || [],
    trades: body.trades || [],
    studentCategories: body.studentCategories || [],
    requirements: normalizeRequirements(body.requirements),
    reportingDates: body.reportingDates || [],
    deadlines: body.deadlines || [],
    instructions: body.instructions || '',
    contact: body.contact || {},
    paymentInfo: body.paymentInfo || {},
    attachments: body.attachments || [],
    status: 'draft',
    createdBy: req.user._id,
  });

  await pack.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'pack',
    entity: pack._id,
    action: 'created',
    by: req.user._id,
  });
  res.status(201).json({ success: true, data: { pack: pack.toClient() } });
});

export const updatePack = asyncHandler(async (req, res) => {
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pack) throw ApiError.notFound('Admission pack not found');
  if (pack.status !== 'draft') {
    throw ApiError.conflict('Published packs are immutable. Create a new version to make changes.');
  }

  const body = req.body;
  if (body.school && String(body.school) !== String(pack.school)) {
    const school = await resolveSchool(req.user._id, body.school);
    pack.school = school._id;
    pack.schoolName = school.schoolName;
  }

  const assignable = [
    'academicYear',
    'title',
    'admissionPeriod',
    'levels',
    'trades',
    'studentCategories',
    'reportingDates',
    'deadlines',
    'instructions',
    'contact',
    'paymentInfo',
    'attachments',
  ];
  for (const key of assignable) {
    if (body[key] !== undefined) pack[key] = body[key];
  }
  if (body.requirements !== undefined) pack.requirements = normalizeRequirements(body.requirements);

  await pack.save();
  res.json({ success: true, data: { pack: pack.toClient() } });
});

export const publishPack = asyncHandler(async (req, res) => {
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pack) throw ApiError.notFound('Admission pack not found');
  if (pack.status === 'archived') throw ApiError.conflict('An archived pack cannot be published');
  if (!pack.requirements || pack.requirements.length === 0) {
    throw ApiError.badRequest('Add at least one requirement before publishing');
  }

  const version = pack.version + 1;
  const snapshot = pack.buildSnapshot();
  snapshot.version = version;

  pack.versions.push({
    version,
    snapshot,
    publishedAt: new Date(),
    publishedBy: req.user._id,
    note: req.body.note || '',
  });
  pack.version = version;
  pack.status = 'published';
  pack.publishedAt = new Date();
  pack.publishedBy = req.user._id;

  await pack.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'pack',
    entity: pack._id,
    action: 'published',
    by: req.user._id,
    meta: { version },
  });
  res.json({ success: true, data: { pack: pack.toClient() } });
});

export const archivePack = asyncHandler(async (req, res) => {
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pack) throw ApiError.notFound('Admission pack not found');
  pack.status = 'archived';
  pack.archivedAt = new Date();
  await pack.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'pack',
    entity: pack._id,
    action: 'archived',
    by: req.user._id,
  });
  res.json({ success: true, data: { pack: pack.toClient() } });
});

// Clones a published/archived pack into a new editable draft version. Published
// history is never mutated.
export const newVersion = asyncHandler(async (req, res) => {
  const source = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!source) throw ApiError.notFound('Admission pack not found');

  const clone = new AdmissionPack({
    owner: source.owner,
    school: source.school,
    schoolName: source.schoolName,
    academicYear: source.academicYear,
    title: source.title,
    admissionPeriod: source.admissionPeriod,
    levels: source.levels,
    trades: source.trades,
    studentCategories: source.studentCategories,
    requirements: source.requirements.map((r) => r.toObject()),
    reportingDates: source.reportingDates,
    deadlines: source.deadlines,
    instructions: source.instructions,
    contact: source.contact,
    paymentInfo: source.paymentInfo,
    attachments: source.attachments,
    status: 'draft',
    version: source.version,
    previousVersionOf: source._id,
    createdBy: req.user._id,
  });

  await clone.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'pack',
    entity: clone._id,
    action: 'version_cloned',
    by: req.user._id,
    meta: { from: source._id.toString() },
  });
  res.status(201).json({ success: true, data: { pack: clone.toClient() } });
});

export const deletePack = asyncHandler(async (req, res) => {
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner: req.user._id });
  if (!pack) throw ApiError.notFound('Admission pack not found');
  if (pack.status !== 'draft') {
    throw ApiError.conflict('Only draft packs can be deleted. Archive published packs instead.');
  }
  const used = await AdmissionApplication.exists({ owner: req.user._id, admissionPack: pack._id });
  if (used) throw ApiError.conflict('This pack is referenced by applications and cannot be deleted');
  await pack.deleteOne();
  res.json({ success: true, data: { message: 'Admission pack removed' } });
});

export const packStats = asyncHandler(async (req, res) => {
  const owner = req.user._id;
  const pack = await AdmissionPack.findOne({ _id: req.params.id, owner });
  if (!pack) throw ApiError.notFound('Admission pack not found');

  const requirements = await StudentRequirement.find({ owner, admissionPack: pack._id });
  const total = requirements.length;
  const complete = requirements.filter((r) => r.isComplete()).length;
  const verified = requirements.filter((r) => r.schoolVerified).length;

  res.json({
    success: true,
    data: { total, complete, verified, pending: total - complete },
  });
});

export default {
  listPacks,
  getPack,
  createPack,
  updatePack,
  publishPack,
  archivePack,
  newVersion,
  deletePack,
  packStats,
};
