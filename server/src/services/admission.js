import { AdmissionPack } from '../models/AdmissionPack.js';
import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { StudentRequirement } from '../models/StudentRequirement.js';
import { AdmissionEvent } from '../models/AdmissionEvent.js';
import { Student } from '../models/Student.js';
import ApiError from '../utils/ApiError.js';

// Stable requirement key within a pack (used to correlate checklist items).
export function slugKey(title, fallback = 'item') {
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

// Application reference, unique within the account (e.g. ADM-2026-48213).
export async function generateReference(ownerId, year = new Date().getFullYear()) {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `ADM-${year}-${Math.floor(10000 + Math.random() * 90000)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await AdmissionApplication.exists({ owner: ownerId, reference: candidate });
    if (!exists) return candidate;
  }
  throw ApiError.conflict('Could not allocate a unique application reference, please try again');
}

// Candidate index number, unique within the account (e.g. QL-2026-48213).
export async function generateIndexNumber(ownerId, year = new Date().getFullYear()) {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `QL-${year}-${Math.floor(10000 + Math.random() * 90000)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Student.exists({ owner: ownerId, indexNumber: candidate });
    if (!exists) return candidate;
  }
  throw ApiError.conflict('Could not allocate a unique index number, please try again');
}

export async function recordEvent({
  owner,
  entityType,
  entity = null,
  action,
  by = null,
  note = '',
  meta = null,
}) {
  try {
    await AdmissionEvent.create({ owner, entityType, entity, action, by, note, meta });
  } catch {
    // Audit logging must never block the primary action.
  }
}

// Requirements from a pack snapshot that apply to a learner, in display order.
export function applicableRequirements(snapshot, target = {}) {
  if (!snapshot || !Array.isArray(snapshot.requirements)) return [];
  return snapshot.requirements
    .filter((r) => r.status !== 'archived')
    .filter((r) => AdmissionPack.requirementApplies(r, target))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

// Generates the per-student requirement checklist from the frozen pack snapshot.
// Idempotent: existing keys are preserved so history is never rewritten.
export async function buildChecklist({ application, student, owner }) {
  const snapshot = application.packSnapshot;
  if (!snapshot) return [];

  const target = {
    level: application.level || student.level || '',
    trade: application.trade || student.trade || '',
    studentCategory: application.studentCategory || '',
  };

  const requirements = applicableRequirements(snapshot, target);
  const existing = await StudentRequirement.find({
    owner,
    student: student._id,
    admissionPack: application.admissionPack || null,
    packVersion: application.packVersion ?? null,
  }).select('key');
  const existingKeys = new Set(existing.map((r) => r.key));

  const toCreate = requirements
    .filter((r) => !existingKeys.has(r.key))
    .map((r, index) => ({
      owner,
      school: application.school,
      student: student._id,
      application: application._id,
      admissionPack: application.admissionPack || null,
      packVersion: application.packVersion ?? null,
      academicYear: application.academicYear,
      key: r.key,
      type: r.type,
      category: r.category,
      title: r.title,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      deadline: r.deadline || null,
      sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : index,
      requiresVerification: ['required_document', 'requires_verification'].includes(r.type),
    }));

  if (toCreate.length > 0) {
    await StudentRequirement.insertMany(toCreate);
  }

  return StudentRequirement.find({ owner, student: student._id }).sort({ sortOrder: 1 });
}

export default {
  slugKey,
  generateReference,
  generateIndexNumber,
  recordEvent,
  applicableRequirements,
  buildChecklist,
};
