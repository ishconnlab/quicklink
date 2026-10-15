import { StudentRequirement } from '../models/StudentRequirement.js';
import { AdmissionApplication } from '../models/AdmissionApplication.js';
import { Student } from '../models/Student.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { buildChecklist, recordEvent } from '../services/admission.js';

async function summaryFor(ownerId, studentId) {
  const requirements = await StudentRequirement.find({ owner: ownerId, student: studentId }).sort({
    sortOrder: 1,
  });
  const total = requirements.length;
  const complete = requirements.filter((r) => r.isComplete()).length;
  const verified = requirements.filter((r) => r.schoolVerified).length;
  return {
    requirements: requirements.map((r) => r.toClient()),
    summary: {
      total,
      complete,
      verified,
      pending: total - complete,
      readiness: total === 0 ? 100 : Math.round((complete / total) * 100),
    },
  };
}

export const getStudentChecklist = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.studentId, owner: req.user._id });
  if (!student) throw ApiError.notFound('Student not found');
  const data = await summaryFor(req.user._id, student._id);
  res.json({ success: true, data: { student: student.toClient(), ...data } });
});

// Idempotently (re)builds the checklist from the linked application's frozen
// pack snapshot. Existing items and their history are preserved.
export const regenerateChecklist = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.studentId, owner: req.user._id });
  if (!student) throw ApiError.notFound('Student not found');

  const application = await AdmissionApplication.findOne({
    owner: req.user._id,
    student: student._id,
    packSnapshot: { $ne: null },
  }).sort({ updatedAt: -1 });
  if (!application) {
    throw ApiError.badRequest('No admission pack is linked to this student');
  }

  await buildChecklist({ application, student, owner: req.user._id });
  const data = await summaryFor(req.user._id, student._id);
  res.json({ success: true, data: { student: student.toClient(), ...data } });
});

export const updateRequirement = asyncHandler(async (req, res) => {
  const requirement = await StudentRequirement.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!requirement) throw ApiError.notFound('Requirement not found');

  if (req.body.parentStatus !== undefined) {
    requirement.parentStatus = req.body.parentStatus;
    requirement.parentUpdatedAt = new Date();
  }
  if (req.body.parentNote !== undefined) requirement.parentNote = req.body.parentNote;

  if (req.body.schoolVerified !== undefined) {
    requirement.schoolVerified = req.body.schoolVerified;
    if (req.body.schoolVerified) {
      requirement.verifiedBy = req.user._id;
      requirement.verifiedAt = new Date();
    } else {
      requirement.verifiedBy = null;
      requirement.verifiedAt = null;
    }
  }
  if (req.body.schoolNote !== undefined) requirement.schoolNote = req.body.schoolNote;
  if (req.body.assistance !== undefined) {
    requirement.assistance = {
      needed: Boolean(req.body.assistance.needed),
      note: req.body.assistance.note || '',
    };
  }

  await requirement.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'requirement',
    entity: requirement._id,
    action: 'updated',
    by: req.user._id,
  });
  res.json({ success: true, data: { requirement: requirement.toClient() } });
});

// Staff-facing queue: every checklist item still needing verification.
export const pendingVerifications = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
  const filter = { owner: req.user._id, requiresVerification: true, schoolVerified: false };
  if (req.query.school) filter.school = req.query.school;

  const items = await StudentRequirement.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('student', 'fullName indexNumber schoolName');

  res.json({
    success: true,
    data: {
      items: items.map((r) => ({
        ...r.toClient(),
        studentName: r.student?.fullName || '',
        indexNumber: r.student?.indexNumber || '',
      })),
    },
  });
});

export default {
  getStudentChecklist,
  regenerateChecklist,
  updateRequirement,
  pendingVerifications,
};
