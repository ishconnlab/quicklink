import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { ClassChatMessage } from '../models/ClassChatMessage.js';
import { ClassInvitation } from '../models/ClassInvitation.js';
import { ClassSessionNote } from '../models/ClassSessionNote.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { Notification } from '../models/Notification.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { deleteCloudinaryAsset } from './cloudinary.js';

const COURSE_IMAGE_DIR = path.resolve(process.env.COURSE_IMAGE_DIR || fileURLToPath(new URL('../../course-images/', import.meta.url)));
const REGISTRATION_IMAGE_DIR = path.resolve(config.registrationImageDir || fileURLToPath(new URL('../../registration-images/', import.meta.url)));
const SUBMISSION_DIR = path.resolve(process.env.SUBMISSIONS_DIR || fileURLToPath(new URL('../../private-submissions/', import.meta.url)));

async function removeStoredFile(directory, name) {
  if (!name || path.basename(name) !== name) return;
  try { await fs.unlink(path.join(directory, name)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function permanentlyDeleteClass(classId) {
  const learningClass = await LearningClass.findById(classId);
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (await LiveSession.exists({ learningClass: learningClass._id, status: 'live' })) {
    throw ApiError.conflict('End the live session before permanently deleting this class.');
  }

  const [sessions, assignments, forms] = await Promise.all([
    LiveSession.find({ learningClass: learningClass._id }).select('_id').lean(),
    Assignment.find({ learningClass: learningClass._id }).select('_id').lean(),
    TrainingRegistrationForm.find({ learningClass: learningClass._id }).select('_id imageFile imagePublicId').lean(),
  ]);
  const sessionIds = sessions.map(({ _id }) => _id);
  const assignmentIds = assignments.map(({ _id }) => _id);
  const formIds = forms.map(({ _id }) => _id);
  const submissions = await AssignmentSubmission.find({
    $or: [{ learningClass: learningClass._id }, { assignment: { $in: assignmentIds } }],
  }).select('files').lean();

  await Promise.all([
    ...submissions.flatMap((submission) => (submission.files || []).map((file) => removeStoredFile(SUBMISSION_DIR, file.storageKey))),
    removeStoredFile(COURSE_IMAGE_DIR, learningClass.thumbnailFile),
    ...forms.map((form) => removeStoredFile(REGISTRATION_IMAGE_DIR, form.imageFile)),
  ]);

  if (config.cloudinary.enabled) {
    const cloudAssets = [
      learningClass.thumbnailPublicId,
      ...forms.map((form) => form.imagePublicId),
    ].filter(Boolean);
    await Promise.all(cloudAssets.map((publicId) => deleteCloudinaryAsset({ publicId, resourceType: 'image' })));
  }

  await Promise.all([
    ClassSessionNote.deleteMany({ session: { $in: sessionIds } }),
    ClassChatMessage.deleteMany({ session: { $in: sessionIds } }),
    ClassInvitation.deleteMany({ learningClass: learningClass._id }),
    CourseCertificate.deleteMany({ course: learningClass._id }),
    CertificationAssessmentAttempt.deleteMany({ course: learningClass._id }),
    AssignmentSubmission.deleteMany({ $or: [{ learningClass: learningClass._id }, { assignment: { $in: assignmentIds } }] }),
    Assignment.deleteMany({ learningClass: learningClass._id }),
    TrainingRegistration.deleteMany({ form: { $in: formIds } }),
    TrainingRegistrationForm.deleteMany({ learningClass: learningClass._id }),
    LiveSession.deleteMany({ learningClass: learningClass._id }),
    Notification.deleteMany({ href: { $in: [`/classes/${learningClass._id}`, `/courses/${learningClass._id}`] } }),
  ]);
  await LearningClass.deleteOne({ _id: learningClass._id });
  return learningClass;
}

export default permanentlyDeleteClass;
