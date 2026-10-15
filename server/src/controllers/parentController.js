import { GuardianLink } from '../models/Guardian.js';
import { StudentRequirement } from '../models/StudentRequirement.js';
import { Student } from '../models/Student.js';
import { recordEvent } from '../services/admission.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Confirms an approved guardian link between the authenticated parent and the
// given student, so a parent can never reach an unlinked child.
async function assertLink(userId, studentId) {
  const link = await GuardianLink.findOne({
    user: userId,
    student: studentId,
    status: 'approved',
  });
  if (!link) throw ApiError.forbidden('This learner is not linked to your account');
  return link;
}

function summarise(requirements) {
  const total = requirements.length;
  const complete = requirements.filter((r) => r.isComplete()).length;
  return {
    total,
    complete,
    pending: total - complete,
    readiness: total === 0 ? 100 : Math.round((complete / total) * 100),
  };
}

export const getChildren = asyncHandler(async (req, res) => {
  const links = await GuardianLink.find({ user: req.user._id, status: 'approved' }).populate(
    'student'
  );
  const children = await Promise.all(
    links
      .filter((l) => l.student)
      .map(async (l) => {
        const requirements = await StudentRequirement.find({
          owner: l.owner,
          student: l.student._id,
        });
        return {
          link: l.toClient(),
          student: l.student.toClient(),
          checklist: summarise(requirements),
        };
      })
  );
  res.json({ success: true, data: { children } });
});

export const getChildChecklist = asyncHandler(async (req, res) => {
  const studentId = req.params.studentId;
  await assertLink(req.user._id, studentId);
  const student = await Student.findById(studentId);
  if (!student) throw ApiError.notFound('Student not found');

  const requirements = await StudentRequirement.find({
    owner: student.owner,
    student: student._id,
  }).sort({ sortOrder: 1 });

  res.json({
    success: true,
    data: {
      student: student.toClient(),
      requirements: requirements.map((r) => r.toClient()),
      summary: summarise(requirements),
    },
  });
});

// Parents may only set their own readiness fields, never staff verification.
export const updateChildRequirement = asyncHandler(async (req, res) => {
  const requirement = await StudentRequirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement not found');
  await assertLink(req.user._id, requirement.student);

  if (req.body.parentStatus !== undefined) {
    requirement.parentStatus = req.body.parentStatus;
    requirement.parentUpdatedAt = new Date();
  }
  if (req.body.parentNote !== undefined) requirement.parentNote = req.body.parentNote;

  await requirement.save();
  await recordEvent({
    owner: requirement.owner,
    entityType: 'requirement',
    entity: requirement._id,
    action: 'parent_updated',
    by: req.user._id,
    meta: { parentStatus: requirement.parentStatus },
  });
  res.json({ success: true, data: { requirement: requirement.toClient() } });
});

export default { getChildren, getChildChecklist, updateChildRequirement };
