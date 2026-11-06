import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { LearningBook } from '../models/LearningBook.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LiveSession } from '../models/LiveSession.js';
import { emitClassSessionEnded } from '../services/classRealtime.js';
import { permanentlyDeleteClass as deleteClassRecords } from '../services/permanentlyDeleteClass.js';
import { deleteCloudinaryAsset, uploadCloudinaryBuffer, validateCloudinaryConfig } from '../services/cloudinary.js';
import { isAdmin, canManageClass, assertCanManageClass, canAccessClass } from '../security/roles.js';
import { recordActivity } from '../services/activityLog.js';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import config from '../config/env.js';

const personFields = 'name email role isActive';
const COURSE_IMAGE_DIR = path.resolve(process.env.COURSE_IMAGE_DIR || fileURLToPath(new URL('../../course-images/', import.meta.url)));
const IMAGE_FORMATS = [
  { ext: 'png', mime: 'image/png', matches: (b) => b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: 'jpg', mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', matches: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

async function resolveRoster(teacherId, studentIds) {
  const teacherIds = [...new Set((Array.isArray(teacherId) ? teacherId : [teacherId]).filter(Boolean).map(String))];
  const [teachers, students] = await Promise.all([
    User.find({ _id: { $in: teacherIds }, role: 'teacher', isActive: true }),
    User.find({ _id: { $in: studentIds }, role: 'student', isActive: true }).select('_id'),
  ]);
  if (!teachers.length || teachers.length !== teacherIds.length) throw ApiError.badRequest('Choose one or more active teacher accounts.');
  if (students.length !== new Set(studentIds.map(String)).size) {
    throw ApiError.badRequest('Choose active student accounts for the class.');
  }
  return { teachers, students };
}

async function validateLearningMaterials(ids = [], level) {
  const uniqueIds = [...new Set(ids.map(String))];
  if (!uniqueIds.length) return uniqueIds;
  const count = await LearningBook.countDocuments({ _id: { $in: uniqueIds }, active: true, processingStatus: 'ready', ...(level ? { level } : {}) });
  if (count !== uniqueIds.length) throw ApiError.badRequest(`Choose available learning documents that match the ${level || 'selected'} class level.`);
  return uniqueIds;
}

async function assertClassAccess(learningClass, user) {
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (!canAccessClass(user, learningClass)) {
    throw ApiError.forbidden('You are not enrolled in this class.');
  }
}

function classJson(item, liveSession = null, recentSession = null) {
  return {
    id: item._id.toString(),
    title: item.title,
    subject: item.subject,
    trade: item.trade || '',
    introduction: item.introduction || '',
    thumbnailUrl: item.thumbnailUrl || (item.thumbnailFile ? `/api/courses/${item._id}/thumbnail` : ''),
    course: item.course || '',
    level: item.level,
    description: item.description,
    active: item.active,
    published: item.published !== false,
    enrolledCount: (item.students || []).length,
    learningMaterials: (item.learningMaterials || []).map((book) => (book._id || book).toString()),
    completionRequirements: item.completionRequirements || { requireReading: false, requireTheory: false, requirePractical: false, requireAttendance: false, minimumScore: 0 },
    archivedAt: item.archivedAt || null,
    startsAt: item.startsAt,
    endsAt: item.endsAt || null,
    enrollmentOpensAt: item.enrollmentOpensAt || null,
    enrollmentClosesAt: item.enrollmentClosesAt || null,
    schedule: item.schedule || '',
    durationMinutes: item.durationMinutes || 60,
    lateThresholdMinutes: item.lateThresholdMinutes ?? 15,
    earlyThresholdPercent: item.earlyThresholdPercent ?? 75,
    timezone: item.timezone || 'Africa/Johannesburg',
    maxStudents: item.maxStudents || 300,
    enrollmentOpen: item.enrollmentOpen !== false,
    teacher: item.teacher && typeof item.teacher === 'object' && item.teacher.name
      ? { id: item.teacher._id.toString(), name: item.teacher.name, email: item.teacher.email }
      : item.teacher ? { id: item.teacher.toString(), name: 'Teacher' } : null,
    students: (item.students || []).map((student) => student.name
      ? { id: student._id.toString(), name: student.name, email: student.email }
      : { id: student.toString(), name: 'Student' }),
    teachers: (item.teachers || []).map((teacher) => teacher.name
      ? { id: teacher._id.toString(), name: teacher.name, email: teacher.email }
      : { id: teacher.toString(), name: 'Teacher' }),
    liveSession: liveSession ? sessionJson(liveSession) : null,
    recentSession: recentSession ? sessionJson(recentSession) : null,
  };
}

function sessionJson(session) {
  return {
    id: session._id.toString(),
    sessionCode: session.sessionCode,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    report: session.report,
  };
}

export const listPeople = asyncHandler(async (req, res) => {
  const role = req.params.role === 'teachers' ? 'teacher' : 'student';
  const users = await User.find({ role, isActive: true }).select(personFields).sort({ name: 1 }).limit(2000);
  res.json({ success: true, data: { people: users.map((user) => ({ id: user._id.toString(), name: user.name, email: user.email })) } });
});

export const listClasses = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const includeArchived = admin && req.query.includeArchived === 'true';
  const filter = admin
    ? (includeArchived ? {} : { active: true })
    : req.user.role === 'teacher'
      ? { $or: [{ teacher: req.user._id }, { teachers: req.user._id }], active: true }
      : { students: req.user._id, active: true };
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 24)));
  const [classes, total] = await Promise.all([
    LearningClass.find(filter).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    LearningClass.countDocuments(filter),
  ]);
  const ids = classes.map((item) => item._id);
  const sessions = await LiveSession.find({ learningClass: { $in: ids } }).sort({ startedAt: -1 }).lean();
  const liveByClass = new Map();
  const recentByClass = new Map();
  for (const session of sessions) {
    const key = session.learningClass.toString();
    if (!recentByClass.has(key)) recentByClass.set(key, session);
    if (session.status === 'live' && !liveByClass.has(key)) liveByClass.set(key, session);
  }
  const canViewHistory = req.user.role !== 'student';
  res.json({ success: true, data: { classes: classes.map((item) => classJson(item, liveByClass.get(item.id), canViewHistory ? recentByClass.get(item.id) : null)), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

function courseJson(item, user, progressByBook = new Map()) {
  const userId = user?._id?.toString();
  const enrolled = Boolean(userId && (item.students || []).some((person) => (person._id || person).toString() === userId));
  const enrolledCount = (item.students || []).length;
  const enrollmentStatus = enrolled ? 'enrolled'
    : !item.active ? 'archived'
      : item.published === false ? 'unpublished'
        : !item.enrollmentOpen ? 'closed'
          : enrolledCount >= item.maxStudents ? 'full' : 'open';
  const materials = (item.learningMaterials || []).filter((book) => book && book.title).map((book) => {
    const progress = progressByBook.get(book._id.toString());
    return { id: book._id.toString(), title: book.title, level: book.level, format: book.format, progress: progress ? { positionType: progress.positionType, positionIndex: progress.positionIndex, progressPercent: progress.progressPercent, completed: progress.completed } : null };
  });
  const readingProgress = materials.length ? Math.round(materials.reduce((sum, book) => sum + (book.progress?.completed ? 100 : book.progress?.progressPercent || 0), 0) / materials.length) : 0;
  return {
    ...classJson(item),
    enrolled,
    enrollmentStatus,
    seatsAvailable: Math.max(0, item.maxStudents - enrolledCount),
    learningMaterials: materials,
    readingProgress,
    readingComplete: materials.length > 0 && materials.every((book) => book.progress?.completed),
  };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validateClassDates(body) {
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  const enrollOpen = body.enrollmentOpensAt ? new Date(body.enrollmentOpensAt) : null;
  const enrollClose = body.enrollmentClosesAt ? new Date(body.enrollmentClosesAt) : null;
  if (start && end && end <= start) throw ApiError.badRequest('The class end date must be after its start date.');
  if (enrollOpen && enrollClose && enrollClose <= enrollOpen) throw ApiError.badRequest('Enrollment must close after it opens.');
  if (start && enrollClose && enrollClose > start) throw ApiError.badRequest('Enrollment must close before the class starts.');
}

export const listCourses = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const manage = req.query.manage === 'true' && (admin || req.user.role === 'teacher');
  const enrolledOnly = req.query.enrolled === 'true';
  const filter = manage
    ? (admin ? {} : { $or: [{ teacher: req.user._id }, { teachers: req.user._id }] })
    : enrolledOnly
      ? { students: req.user._id, active: true }
      : { active: true, $or: [{ published: true }, { published: { $exists: false } }] };
  if (req.query.level) filter.level = req.query.level;
  else if (req.user.role === 'student' && req.user.educationLevel && !enrolledOnly) filter.level = req.user.educationLevel;
  if (req.query.subject) filter.subject = { $regex: escapeRegex(req.query.subject), $options: 'i' };
  if (req.query.trade) filter.trade = { $regex: escapeRegex(req.query.trade), $options: 'i' };
  if (req.query.search) {
    const search = new RegExp(escapeRegex(req.query.search), 'i');
    const searchFilter = [{ title: search }, { subject: search }, { trade: search }, { course: search }, { introduction: search }, { description: search }];
    if (filter.$or) { filter.$and = [{ $or: filter.$or }, { $or: searchFilter }]; delete filter.$or; }
    else filter.$or = searchFilter;
  }
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const [items, total, subjects, trades] = await Promise.all([
    LearningClass.find(filter).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email').populate('learningMaterials', 'title level format active')
      .sort(req.query.sort === 'title' ? { title: 1 } : req.query.sort === 'popular' ? { students: -1, updatedAt: -1 } : req.query.sort === 'level' ? { level: 1, title: 1 } : { updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LearningClass.countDocuments(filter),
    LearningClass.distinct('subject', manage ? {} : { active: true, $or: [{ published: true }, { published: { $exists: false } }] }),
    LearningClass.distinct('trade', manage ? {} : { active: true, $or: [{ published: true }, { published: { $exists: false } }] }),
  ]);
  const progress = req.user.role === 'student' ? await LearningProgress.find({ student: req.user._id, book: { $in: items.flatMap((item) => item.learningMaterials.map((book) => book._id)) } }).lean() : [];
  const progressByBook = new Map(progress.map((record) => [record.book.toString(), record]));
  res.json({ success: true, data: { courses: items.map((item) => courseJson(item, req.user, progressByBook)), page, limit, total, pages: Math.ceil(total / limit), subjects: subjects.sort(), trades: trades.filter(Boolean).sort() } });
});

export const getCourse = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email').populate('learningMaterials', 'title level format active').lean();
  if (!item) throw ApiError.notFound('Course not found.');
  const enrolled = (item.students || []).some((person) => person._id.toString() === req.user._id.toString());
  const teacherIds = [item.teacher, ...(item.teachers || [])].filter(Boolean).map((teacher) => teacher._id.toString());
  const assignedTeacher = req.user.role === 'teacher' && teacherIds.includes(req.user._id.toString());
  if (!isAdmin(req.user) && !assignedTeacher && (!item.active || (item.published === false && !enrolled))) throw ApiError.notFound('Course not found.');
  const progress = req.user.role === 'student' ? await LearningProgress.find({ student: req.user._id, book: { $in: item.learningMaterials.map((book) => book._id) } }).lean() : [];
  res.json({ success: true, data: { course: courseJson(item, req.user, new Map(progress.map((record) => [record.book.toString(), record]))) } });
});

export const enrollInCourse = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only student accounts can enroll in courses.');
  const id = req.params.id;
  const studentId = req.user._id;
  const now = new Date();
  const item = await LearningClass.findOneAndUpdate(
    {
      _id: id,
      active: true,
      published: { $ne: false },
      enrollmentOpen: true,
      students: { $ne: studentId },
      $and: [
        { $or: [{ enrollmentOpensAt: null }, { enrollmentOpensAt: { $lte: now } }] },
        { $or: [{ enrollmentClosesAt: null }, { enrollmentClosesAt: { $gte: now } }] },
      ],
      $expr: { $lt: [{ $size: { $ifNull: ['$students', []] } }, { $ifNull: ['$maxStudents', 300] }] },
    },
    { $addToSet: { students: studentId } },
    { new: true },
  ).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email').populate('learningMaterials', 'title level format active');
  if (!item) {
    const current = await LearningClass.findById(id).select('active published enrollmentOpen enrollmentOpensAt enrollmentClosesAt maxStudents students');
    if (!current || !current.active || current.published === false) throw ApiError.notFound('This course is not available for enrollment.');
    if (current.students.some((person) => person.toString() === studentId.toString())) throw ApiError.conflict('You are already enrolled in this course.');
    if (!current.enrollmentOpen) throw ApiError.conflict('Enrollment is closed for this course.');
    if (current.enrollmentOpensAt && current.enrollmentOpensAt > now) throw ApiError.conflict('Enrollment has not opened for this course yet.');
    if (current.enrollmentClosesAt && current.enrollmentClosesAt < now) throw ApiError.conflict('Enrollment has closed for this course.');
    if (current.students.length >= current.maxStudents) throw ApiError.conflict('This course has reached its enrollment capacity.');
    throw ApiError.conflict('Course enrollment could not be completed. Please retry.');
  }
  await recordActivity(req, { action: 'course.enrolled', resourceType: 'class', resourceId: item._id, message: `Enrolled in ${item.title}.` });
  res.status(201).json({ success: true, data: { course: courseJson(item, req.user), enrollment: { status: 'enrolled', enrolledAt: new Date() } } });
});

export const updateCourseThumbnail = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP thumbnail.');
  if (req.file.size > 3 * 1024 * 1024) throw ApiError.badRequest('Course thumbnails must be 3 MB or smaller.');
  const format = IMAGE_FORMATS.find((item) => item.mime === req.file.mimetype && item.matches(req.file.buffer));
  if (!format) throw ApiError.badRequest('Thumbnail content must match a PNG, JPEG, or WebP image.');
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Course not found.');
  assertCanManageClass(req.user, item);
  const previousFile = item.thumbnailFile;
  const previousPublicId = item.thumbnailPublicId;
  let uploaded;
  let localPath;
  if (config.cloudinary.enabled) {
    uploaded = await uploadCloudinaryBuffer({
      buffer: req.file.buffer,
      folder: `${config.cloudinary.folderPrefix}/course-thumbnails`,
      resourceType: 'image',
    });
    item.thumbnailFile = '';
    item.thumbnailPublicId = uploaded.publicId;
    item.thumbnailUrl = uploaded.secureUrl;
  } else {
    await fs.mkdir(COURSE_IMAGE_DIR, { recursive: true });
    const name = `${randomUUID()}.${format.ext}`;
    localPath = path.join(COURSE_IMAGE_DIR, name);
    await fs.writeFile(localPath, req.file.buffer, { flag: 'wx', mode: 0o640 });
    item.thumbnailFile = name;
    item.thumbnailPublicId = '';
    item.thumbnailUrl = '';
  }
  try { await item.save(); }
  catch (error) {
    if (localPath) await fs.unlink(localPath).catch(() => {});
    if (uploaded?.publicId) await deleteCloudinaryAsset({ publicId: uploaded.publicId, resourceType: 'image' }).catch((cleanupError) => console.warn('[storage] Could not remove unreferenced course thumbnail from Cloudinary:', cleanupError.message));
    throw error;
  }
  if (previousFile) await fs.unlink(path.join(COURSE_IMAGE_DIR, path.basename(previousFile))).catch(() => {});
  if (previousPublicId && config.cloudinary.enabled) await deleteCloudinaryAsset({ publicId: previousPublicId, resourceType: 'image' }).catch((error) => console.warn('[storage] Could not remove replaced course thumbnail from Cloudinary:', error.message));
  res.json({ success: true, data: { thumbnailUrl: item.thumbnailUrl || `/api/courses/${item._id}/thumbnail` } });
});

export const getCourseThumbnail = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).select('active published thumbnailFile thumbnailUrl');
  if (!item || (!item.thumbnailFile && !item.thumbnailUrl) || (!isAdmin(req.user) && (!item.active || item.published === false))) throw ApiError.notFound('Course thumbnail not found.');
  if (item.thumbnailUrl) return res.redirect(302, item.thumbnailUrl);
  const name = path.basename(item.thumbnailFile);
  if (name !== item.thumbnailFile) throw ApiError.notFound('Course thumbnail not found.');
  const fullPath = path.join(COURSE_IMAGE_DIR, name);
  let buffer;
  try { buffer = await fs.readFile(fullPath); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Course thumbnail not found.'); throw error; }
  const format = IMAGE_FORMATS.find((candidate) => candidate.matches(buffer));
  if (!format) throw ApiError.notFound('Course thumbnail is invalid.');
  res.setHeader('Content-Type', format.mime);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export const createClass = asyncHandler(async (req, res) => {
  const requestId = req.get('Idempotency-Key');
  if (requestId && !/^[a-f\d]{24}$/i.test(requestId)) {
    throw ApiError.badRequest('Class creation request ID is invalid.');
  }
  if (requestId) {
    const existing = await LearningClass.findById(requestId);
    if (existing) {
      if (existing.createdBy.toString() !== req.user._id.toString()) {
        throw ApiError.conflict('This class creation request ID is already in use.');
      }
      await existing.populate('teacher', 'name email');
      await existing.populate('teachers', 'name email');
      await existing.populate('students', 'name email');
      return res.status(200).json({ success: true, data: { class: classJson(existing) } });
    }
  }

  const { teachers, students } = await resolveRoster(
    req.user.role === 'teacher' ? [req.user._id] : (req.body.teacherIds || req.body.teacherId),
    req.body.studentIds,
  );
  validateClassDates(req.body);
  const learningMaterials = await validateLearningMaterials(req.body.learningMaterials || [], req.body.level);
  if (students.length > (req.body.maxStudents || 300)) throw ApiError.badRequest('The selected roster exceeds the class capacity.');
  const item = new LearningClass({
    ...(requestId ? { _id: requestId } : {}),
    title: req.body.title,
    subject: req.body.subject,
    trade: req.body.trade || '',
    introduction: req.body.introduction || '',
    learningMaterials,
    completionRequirements: req.body.completionRequirements || {},
    course: req.body.course,
    level: req.body.level,
    description: req.body.description,
    teacher: teachers[0]._id,
    teachers: teachers.map((teacher) => teacher._id),
    students: students.map((student) => student._id),
    startsAt: req.body.startsAt || null,
    endsAt: req.body.endsAt || null,
    enrollmentOpensAt: req.body.enrollmentOpensAt || null,
    enrollmentClosesAt: req.body.enrollmentClosesAt || null,
    schedule: req.body.schedule,
    durationMinutes: req.body.durationMinutes,
    lateThresholdMinutes: req.body.lateThresholdMinutes,
    earlyThresholdPercent: req.body.earlyThresholdPercent,
    timezone: req.body.timezone,
    maxStudents: req.body.maxStudents,
    enrollmentOpen: req.body.enrollmentOpen,
    published: req.body.published !== false,
    createdBy: req.user._id,
  });
  try {
    await item.save();
  } catch (error) {
    if (requestId && error?.code === 11000) {
      const existing = await LearningClass.findById(requestId);
      if (existing?.createdBy.toString() === req.user._id.toString()) {
        await existing.populate('teacher', 'name email');
        await existing.populate('teachers', 'name email');
        await existing.populate('students', 'name email');
        return res.status(200).json({ success: true, data: { class: classJson(existing) } });
      }
    }
    throw error;
  }
  await item.populate('teacher', 'name email');
  await item.populate('teachers', 'name email');
  await item.populate('students', 'name email');
  await recordActivity(req, { action: 'class.created', resourceType: 'class', resourceId: item._id, message: `Created class ${item.title}.` });
  res.status(201).json({ success: true, data: { class: classJson(item) } });
});

export const updateClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Class not found');
  assertCanManageClass(req.user, item);
  if (await LiveSession.exists({ learningClass: item._id, status: 'live' })) {
    throw ApiError.conflict('End the live session before changing the class roster.');
  }
  const canReassignTeachers = isAdmin(req.user);
  const existingTeacherIds = item.teachers.map(String).concat(item.teachers.length || !item.teacher ? [] : [item.teacher.toString()]);
  const teacherIds = canReassignTeachers
    ? (req.body.teacherIds || req.body.teacherId || existingTeacherIds)
    : existingTeacherIds;
  const studentIds = req.body.studentIds || item.students.map(String);
  const { teachers, students } = await resolveRoster(teacherIds, studentIds);
  const learningMaterials = await validateLearningMaterials(req.body.learningMaterials || item.learningMaterials.map(String), req.body.level || item.level);
  if (students.length > (req.body.maxStudents ?? item.maxStudents)) throw ApiError.badRequest('The selected roster exceeds the class capacity.');
  for (const field of ['title', 'subject', 'trade', 'introduction', 'learningMaterials', 'completionRequirements', 'course', 'level', 'description', 'active', 'published', 'startsAt', 'endsAt', 'enrollmentOpensAt', 'enrollmentClosesAt', 'schedule', 'durationMinutes', 'lateThresholdMinutes', 'earlyThresholdPercent', 'timezone', 'maxStudents', 'enrollmentOpen']) {
    if (req.body[field] !== undefined) item[field] = req.body[field];
  }
  if (req.body.active === true) item.archivedAt = null;
  validateClassDates({ ...item.toObject(), ...req.body });
  item.teacher = teachers[0]._id;
  item.teachers = teachers.map((teacher) => teacher._id);
  item.students = students.map((student) => student._id);
  item.learningMaterials = learningMaterials;
  await item.save();
  await item.populate('teacher', 'name email');
  await item.populate('teachers', 'name email');
  await item.populate('students', 'name email');
  await recordActivity(req, { action: 'class.updated', resourceType: 'class', resourceId: item._id, message: `Updated class ${item.title}.` });
  res.json({ success: true, data: { class: classJson(item) } });
});

export const getClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email');
  await assertClassAccess(item, req.user);
  const [liveSession, recentSession] = await Promise.all([
    LiveSession.findOne({ learningClass: item._id, status: 'live' }).sort({ startedAt: -1 }),
    LiveSession.findOne({ learningClass: item._id }).sort({ startedAt: -1 }),
  ]);
  res.json({ success: true, data: { class: classJson(item, liveSession, req.user.role === 'student' ? null : recentSession) } });
});

export const listClassSessions = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await assertClassAccess(item, req.user);
  const sessions = await LiveSession.find({ learningClass: item._id, ...(req.user.role === 'student' ? { status: 'live' } : {}) }).sort({ startedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: { sessions: sessions.map((session) => sessionJson(session)) } });
});

export const startSession = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).populate('teacher', 'name email').populate('teachers', 'name email').populate('students', 'name email');
  await assertClassAccess(item, req.user);
  if (req.user.role === 'student') throw ApiError.forbidden('Only the assigned teacher or an admin can start this class.');
  if (!item.active) throw ApiError.conflict('Archived classes cannot start a new session.');
  const current = await LiveSession.findOne({ learningClass: item._id, status: 'live' });
  if (current) throw ApiError.conflict('This class already has a live session.');
  const session = new LiveSession({
    learningClass: item._id,
    sessionCode: randomBytes(9).toString('base64url'),
    title: req.body.title || item.title,
    startedBy: req.user._id,
    startedAt: new Date(),
  });
  await session.save();
  res.status(201).json({ success: true, data: { session: sessionJson(session) } });
});

export const joinByCode = asyncHandler(async (req, res) => {
  const session = await LiveSession.findOne({ sessionCode: req.params.sessionCode }).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session || session.status !== 'live') throw ApiError.notFound('This class link is no longer live.');
  await assertClassAccess(session.learningClass, req.user);
  res.json({
    success: true,
    data: {
      session: sessionJson(session),
      class: classJson(session.learningClass),
      mediaConfigured: Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret),
      canShareScreen: req.user.role !== 'student'
        || session.screenShareAllowed.some((studentId) => studentId.toString() === req.user._id.toString()),
    },
  });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session) throw ApiError.notFound('Class session not found');
  await assertClassAccess(session.learningClass, req.user);
  res.json({
    success: true,
    data: {
      session: sessionJson(session),
      class: classJson(session.learningClass),
      mediaConfigured: Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret),
      canShareScreen: req.user.role !== 'student'
        || session.screenShareAllowed.some((studentId) => studentId.toString() === req.user._id.toString()),
    },
  });
});

export const createLiveKitToken = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session || session.status !== 'live') throw ApiError.notFound('This class session is no longer live.');
  await assertClassAccess(session.learningClass, req.user);
  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    throw ApiError.conflict('Live classroom media is not configured on this server.');
  }
  const room = `quicklink-${session._id.toString()}`;
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: req.user._id.toString(),
    name: req.user.name,
    ttl: '2h',
  });
  const canShareScreen = req.user.role !== 'student'
    || session.screenShareAllowed.some((studentId) => studentId.toString() === req.user._id.toString());
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: canShareScreen
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.MICROPHONE, TrackSource.CAMERA],
  });
  res.json({ success: true, data: { serverUrl: config.livekit.url, token: await token.toJwt(), room } });
});

export const endSession = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session) throw ApiError.notFound('Class session not found');
  await assertClassAccess(session.learningClass, req.user);
  const assignedTeacher = [session.learningClass.teacher, ...(session.learningClass.teachers || [])].filter(Boolean).some((teacher) => (teacher._id || teacher).toString() === req.user._id.toString());
  if (!isAdmin(req.user) && !assignedTeacher) throw ApiError.forbidden('Only the assigned teacher or an admin can end this class.');
  if (session.status === 'ended') return res.json({ success: true, data: { session: sessionJson(session) } });

  const now = new Date();
  session.status = 'ended';
  session.endedAt = now;
  session.report.teacherNotes = req.body.teacherNotes || '';
  session.report.generatedAt = now;
  session.report.durationSeconds = Math.max(0, Math.floor((now.getTime() - session.startedAt.getTime()) / 1000));
  const attendanceByUser = new Map(session.attendance.map((item) => {
    const ongoing = item.lastLeftAt ? 0 : Math.max(0, Math.floor((now.getTime() - item.lastJoinedAt.getTime()) / 1000));
    return [item.user.toString(), { item, totalSeconds: item.totalSeconds + ongoing }];
  }));
  const teachers = [session.learningClass.teacher, ...(session.learningClass.teachers || [])].filter(Boolean);
  const roster = [...new Map([...teachers, ...session.learningClass.students].map((person) => [person._id.toString(), person])).values()];
  session.report.enrolledCount = session.learningClass.students.length;
  const scheduledStart = session.learningClass.startsAt ? new Date(session.learningClass.startsAt).getTime() : null;
  const earlyMinimum = session.report.durationSeconds * ((session.learningClass.earlyThresholdPercent ?? 75) / 100);
  session.report.attendance = roster.map((person) => {
    const record = attendanceByUser.get(person._id.toString());
    const late = Boolean(record && scheduledStart && new Date(record.item.firstJoinedAt).getTime() > scheduledStart + (session.learningClass.lateThresholdMinutes ?? 15) * 60_000);
    const early = Boolean(record && record.totalSeconds < earlyMinimum);
    const status = !record ? 'absent' : late ? 'late' : early ? 'early' : 'present';
    return {
      user: person._id,
      name: person.name,
      email: person.email,
      role: teachers.some((teacher) => teacher._id.toString() === person._id.toString()) ? 'teacher' : 'student',
      attended: Boolean(record),
      status,
      late,
      early,
      firstJoinedAt: record?.item.firstJoinedAt || null,
      lastLeftAt: record ? (record.item.lastLeftAt || now) : null,
      totalSeconds: record?.totalSeconds || 0,
      joinCount: record?.item.joinCount || 0,
    };
  });
  session.report.attendedCount = session.report.attendance.filter((person) => person.attended && person.role === 'student').length;
  session.report.lateCount = session.report.attendance.filter((person) => person.late && person.role === 'student').length;
  session.report.earlyCount = session.report.attendance.filter((person) => person.early && person.role === 'student').length;
  session.report.excusedCount = session.report.attendance.filter((person) => person.status === 'excused' && person.role === 'student').length;
  await session.save();
  emitClassSessionEnded(session._id.toString());
  res.json({ success: true, data: { session: sessionJson(session) } });
});

export const getSessionReport = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session) throw ApiError.notFound('Class session not found');
  await assertClassAccess(session.learningClass, req.user);
  const teacherIds = [session.learningClass.teacher, ...(session.learningClass.teachers || [])].filter(Boolean).map((teacher) => (teacher._id || teacher).toString());
  if (!isAdmin(req.user) && !teacherIds.includes(req.user._id.toString())) throw ApiError.forbidden('Attendance reports are available to the assigned teacher and admin.');
  if (session.status !== 'ended') throw ApiError.conflict('The report is available after the teacher ends the session.');
  res.json({ success: true, data: { session: sessionJson(session), class: classJson(session.learningClass) } });
});

export const correctAttendance = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass', populate: [{ path: 'teacher', select: 'name email' }, { path: 'teachers', select: 'name email' }, { path: 'students', select: 'name email' }],
  });
  if (!session) throw ApiError.notFound('Class session not found');
  await assertClassAccess(session.learningClass, req.user);
  if (session.status !== 'ended') throw ApiError.conflict('Attendance can be corrected after the session ends.');
  const teachers = [session.learningClass.teacher, ...(session.learningClass.teachers || [])].filter(Boolean).map((person) => person._id.toString());
  if (!isAdmin(req.user) && !teachers.includes(req.user._id.toString())) throw ApiError.forbidden('Only an assigned teacher or admin can correct attendance.');
  const entry = session.report.attendance.find((person) => person.user?.toString() === req.params.studentId);
  if (!entry || entry.role !== 'student') throw ApiError.notFound('Student attendance record not found.');
  entry.correctionHistory.push({ fromStatus: entry.status, toStatus: req.body.status, reason: req.body.reason, updatedBy: req.user._id, updatedAt: new Date() });
  entry.status = req.body.status;
  if (req.body.status === 'present' || req.body.status === 'late' || req.body.status === 'early') entry.attended = true;
  if (req.body.status === 'absent') entry.attended = false;
  session.report.attendedCount = session.report.attendance.filter((person) => person.attended && person.role === 'student').length;
  session.report.lateCount = session.report.attendance.filter((person) => person.status === 'late' && person.role === 'student').length;
  session.report.earlyCount = session.report.attendance.filter((person) => person.status === 'early' && person.role === 'student').length;
  session.report.excusedCount = session.report.attendance.filter((person) => person.status === 'excused' && person.role === 'student').length;
  await session.save();
  res.json({ success: true, data: { session: sessionJson(session) } });
});

export const archiveClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Class not found');
  assertCanManageClass(req.user, item);
  if (await LiveSession.exists({ learningClass: item._id, status: 'live' })) throw ApiError.conflict('End the live session before archiving this class.');
  item.active = false;
  item.enrollmentOpen = false;
  item.archivedAt = new Date();
  await item.save();
  await recordActivity(req, { action: 'class.archived', resourceType: 'class', resourceId: item._id, message: `Archived class ${item.title}.` });
  res.json({ success: true, data: { class: { id: item.id, active: false, archivedAt: item.archivedAt } } });
});

export const permanentlyDeleteClass = asyncHandler(async (req, res) => {
  const item = await deleteClassRecords(req.params.id);
  await recordActivity(req, { action: 'class.deleted', resourceType: 'class', resourceId: item._id, message: `Permanently deleted class ${item.title}.` });
  res.json({ success: true, data: { class: { id: item._id.toString(), deleted: true } } });
});

export default { listPeople, listClasses, createClass, updateClass, archiveClass, permanentlyDeleteClass, getClass, listClassSessions, startSession, joinByCode, getSession, createLiveKitToken, endSession, getSessionReport, correctAttendance };


