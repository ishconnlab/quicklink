import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityLog } from '../models/ActivityLog.js';
import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { AssessmentDraft } from '../models/AssessmentDraft.js';
import { Enrollment } from '../models/Enrollment.js';
import { ProjectSubmission } from '../models/ProjectSubmission.js';
import { ClassChatMessage } from '../models/ClassChatMessage.js';
import { ClassInvitation } from '../models/ClassInvitation.js';
import { ClassSessionNote } from '../models/ClassSessionNote.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { LearningAssessmentAttempt } from '../models/LearningAssessmentAttempt.js';
import { LearningClass } from '../models/LearningClass.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LiveSession } from '../models/LiveSession.js';
import { Notification } from '../models/Notification.js';
import { PlatformSetting } from '../models/PlatformSetting.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';

const SUBMISSION_DIR = path.resolve(process.env.SUBMISSIONS_DIR || fileURLToPath(new URL('../../private-submissions/', import.meta.url)));

async function removeStoredFile(name) {
  if (!name || path.basename(name) !== name) return;
  try { await fs.unlink(path.join(SUBMISSION_DIR, name)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function permanentlyDeleteUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (['admin', 'owner'].includes(user.role)) throw ApiError.forbidden('Administrator accounts cannot be permanently deleted here.');

  const classes = await LearningClass.find({
    $or: [{ students: user._id }, { createdBy: user._id }],
  });
  const activeSession = await LiveSession.exists({
    status: 'live',
    $or: [{ startedBy: user._id }, { 'attendance.user': user._id }],
  });
  if (activeSession) throw ApiError.conflict('End any live session this user started and have them leave other live sessions before deleting the account.');

  const ownedSubmissions = await AssignmentSubmission.find({ student: user._id }).select('files').lean();
  await Promise.all(ownedSubmissions.flatMap((submission) => (submission.files || []).map((file) => removeStoredFile(file.storageKey))));

  for (const learningClass of classes) {
    learningClass.students = (learningClass.students || []).filter((studentId) => !studentId.equals(user._id));
    if (learningClass.createdBy?.equals(user._id)) learningClass.createdBy = null;
    await learningClass.save();
  }

  const sessions = await LiveSession.find({
    $or: [
      { startedBy: user._id },
      { 'attendance.user': user._id },
      { 'report.attendance.user': user._id },
      { 'report.attendance.correctionHistory.updatedBy': user._id },
      { screenShareAllowed: user._id },
    ],
  });
  for (const session of sessions) {
    if (session.startedBy?.equals(user._id)) session.startedBy = null;
    session.attendance = session.attendance.filter((entry) => !entry.user.equals(user._id));
    session.screenShareAllowed = session.screenShareAllowed.filter((allowedId) => !allowedId.equals(user._id));
    session.report.attendance = session.report.attendance
      .filter((entry) => !entry.user?.equals(user._id))
      .map((entry) => {
        entry.correctionHistory.forEach((correction) => {
          if (correction.updatedBy?.equals(user._id)) correction.updatedBy = null;
        });
        return entry;
      });
    await session.save();
  }

  await Promise.all([
    LearningProgress.deleteMany({ student: user._id }),
    LearningAssessmentAttempt.deleteMany({ student: user._id }),
    CertificationAssessmentAttempt.deleteMany({ student: user._id }),
    AssessmentDraft.deleteMany({ student: user._id }),
    Enrollment.deleteMany({ student: user._id }),
    Enrollment.updateMany({ paymentVerifiedBy: user._id }, { $set: { paymentVerifiedBy: null } }),
    ProjectSubmission.deleteMany({ student: user._id }),
    ProjectSubmission.updateMany({ reviewedBy: user._id }, { $set: { reviewedBy: null } }),
    CourseCertificate.deleteMany({ student: user._id }),
    Notification.deleteMany({ recipient: user._id }),
    ClassInvitation.deleteMany({ student: user._id }),
    ClassInvitation.updateMany({ sentBy: user._id }, { $set: { sentBy: null } }),
    TrainingRegistration.deleteMany({ student: user._id }),
    TrainingRegistration.updateMany(
      { $or: [{ reviewedBy: user._id }, { 'statusHistory.by': user._id }] },
      { $set: { reviewedBy: null, 'statusHistory.$[history].by': null } },
      { arrayFilters: [{ 'history.by': user._id }] },
    ),
    AssignmentSubmission.deleteMany({ student: user._id }),
    AssignmentSubmission.updateMany({ gradedBy: user._id }, { $set: { gradedBy: null } }),
    AssignmentSubmission.updateMany(
      { 'gradingHistory.gradedBy': user._id },
      { $set: { 'gradingHistory.$[grade].gradedBy': null } },
      { arrayFilters: [{ 'grade.gradedBy': user._id }] },
    ),
    Assignment.updateMany({ createdBy: user._id }, { $set: { createdBy: null } }),
    CourseCertificate.updateMany({ revokedBy: user._id }, { $set: { revokedBy: null } }),
    CourseCertificate.updateMany({ issuedBy: user._id }, { $set: { issuedBy: null } }),
    ClassSessionNote.updateMany({ updatedBy: user._id }, { $set: { updatedBy: null } }),
    PlatformSetting.updateMany({ updatedBy: user._id }, { $set: { updatedBy: null } }),
    ClassChatMessage.deleteMany({ user: user._id }),
    ClassChatMessage.updateMany({ pinnedBy: user._id }, { $set: { pinnedBy: null } }),
    ClassChatMessage.updateMany({ removedBy: user._id }, { $set: { removedBy: null } }),
    ClassChatMessage.updateMany({ 'reports.user': user._id }, { $pull: { reports: { user: user._id } } }),
    ActivityLog.deleteMany({ actor: user._id }),
  ]);

  await User.deleteOne({ _id: user._id });
  return user;
}

export default permanentlyDeleteUser;
