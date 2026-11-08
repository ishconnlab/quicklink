import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { Enrollment } from '../models/Enrollment.js';
import { LiveSession } from '../models/LiveSession.js';
import { emitClassSessionEnded } from '../services/classRealtime.js';
import { permanentlyDeleteClass as deleteClassRecords } from '../services/permanentlyDeleteClass.js';
import { deleteCloudinaryAsset, uploadCloudinaryBuffer } from '../services/cloudinary.js';
import { isAdmin } from '../security/roles.js';
import { recordActivity } from '../services/activityLog.js';
import { assertCanAttend, getEnrollment, paymentState } from '../services/classAccess.js';
import { getPlatformSettings } from '../services/settings.js';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import config from '../config/env.js';

const COURSE_IMAGE_DIR = path.resolve(process.env.COURSE_IMAGE_DIR || fileURLToPath(new URL('../../course-images/', import.meta.url)));
const IMAGE_FORMATS = [
  { ext: 'png', mime: 'image/png', matches: (b) => b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: 'jpg', mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', matches: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveStudents(studentIds = []) {
  const uniqueIds = [...new Set((studentIds || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return [];
  const students = await User.find({ _id: { $in: uniqueIds }, role: 'student', isActive: true }).select('_id name email whatsapp country province');
  if (students.length !== uniqueIds.length) throw ApiError.badRequest('Choose active student accounts.');
  return students;
}

async function assertClassAccess(learningClass, user) {
  if (!learningClass) throw ApiError.notFound('Training not found.');
  if (isAdmin(user)) return;
  const enrolled = (learningClass.students || []).some((student) => (student._id || student).toString() === user._id.toString());
  if (!enrolled) throw ApiError.forbidden('You are not enrolled in this training.');
}

function personJson(person) {
  const id = (person._id || person).toString();
  if (!person.name) return { id, name: 'Student', email: '' };
  return {
    id,
    name: person.name,
    email: person.email || '',
    whatsapp: person.whatsapp || '',
    country: person.country || '',
    province: person.province || '',
    role: person.role || 'student',
  };
}

function enrollmentJson(enrollment, learningClass) {
  if (!enrollment) return null;
  return {
    id: enrollment._id.toString(),
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    paymentStatus: enrollment.paymentStatus,
    paymentAmount: enrollment.paymentAmount,
    paymentCurrency: enrollment.paymentCurrency,
    paymentReference: enrollment.paymentReference,
    paymentNote: enrollment.paymentNote,
    paymentSubmittedAt: enrollment.paymentSubmittedAt,
    paymentVerifiedAt: enrollment.paymentVerifiedAt,
    payment: paymentState(learningClass, enrollment),
  };
}

function classJson(item, options = {}) {
  const { liveSession = null, recentSession = null, enrollment = null, user = null, includeRoster = false } = options;
  const students = includeRoster ? (item.students || []).map(personJson) : [];
  return {
    id: item._id.toString(),
    title: item.title,
    subject: item.subject,
    trade: item.trade || '',
    introduction: item.introduction || '',
    thumbnailUrl: item.thumbnailUrl || (item.thumbnailFile ? `/api/courses/${item._id}/thumbnail` : ''),
    course: item.course || '',
    level: item.level,
    description: item.description || '',
    active: item.active,
    published: item.published !== false,
    archivedAt: item.archivedAt || null,
    enrolledCount: (item.students || []).length,
    students,
    teachers: [],
    teacher: null,
    learningMaterials: [],
    completionRequirements: item.completionRequirements || {},
    assessment: {
      enabled: Boolean(item.certificationAssessmentEnabled),
      questionCount: (item.certificationQuestions || []).length,
      passMark: item.assessmentPassMark ?? 80,
      attempts: item.assessmentAttempts ?? 3,
      lockdown: item.assessmentLockdown !== false,
      minimumAttendanceSessions: item.minimumAttendanceSessions ?? 2,
    },
    projectSubmission: item.projectSubmission || {},
    payment: {
      enabled: Boolean(item.payment?.enabled),
      freeDays: item.payment?.freeDays ?? 2,
      amount: item.payment?.amount || 0,
      currency: item.payment?.currency || 'RWF',
      paymentCode: item.payment?.paymentCode || '',
      paymentName: item.payment?.paymentName || '',
      instructions: item.payment?.instructions || '',
    },
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
    allowCancellation: item.allowCancellation !== false,
    enrollment: enrollmentJson(enrollment, item),
    paymentState: enrollment ? paymentState(item, enrollment) : null,
    canManage: Boolean(user && isAdmin(user)),
    liveSession: liveSession ? sessionJson(liveSession) : null,
    recentSession: recentSession ? sessionJson(recentSession) : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function sessionJson(session, options = {}) {
  const data = {
    id: session._id.toString(),
    learningClass: session.learningClass?._id?.toString?.() || session.learningClass?.toString?.() || null,
    sessionCode: session.sessionCode,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    screenShareAllowed: (session.screenShareAllowed || []).map(String),
  };
  if (options.report) data.report = session.report;
  return data;
}

function learnerSessionJson(session, user) {
  const own = session.report?.attendance?.find((entry) => entry.user?.toString() === user._id.toString());
  return {
    ...sessionJson(session),
    myAttendance: own ? {
      status: own.status,
      attended: own.attended,
      totalSeconds: own.totalSeconds,
      firstJoinedAt: own.firstJoinedAt,
      lastLeftAt: own.lastLeftAt,
      joinCount: own.joinCount,
    } : null,
  };
}

function courseJson(item, user, enrollment = null) {
  const enrolled = Boolean(enrollment && enrollment.status === 'enrolled');
  const enrolledCount = (item.students || []).length;
  const enrollmentStatus = enrolled ? 'enrolled'
    : !item.active ? 'archived'
      : item.published === false ? 'unpublished'
        : !item.enrollmentOpen ? 'closed'
          : enrolledCount >= item.maxStudents ? 'full' : 'open';
  return {
    ...classJson(item, { user, enrollment, includeRoster: isAdmin(user) }),
    enrolled,
    enrollmentStatus,
    seatsAvailable: Math.max(0, (item.maxStudents || 300) - enrolledCount),
  };
}

function validateClassDates(body) {
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  const enrollOpen = body.enrollmentOpensAt ? new Date(body.enrollmentOpensAt) : null;
  const enrollClose = body.enrollmentClosesAt ? new Date(body.enrollmentClosesAt) : null;
  if (start && end && end <= start) throw ApiError.badRequest('The training end date must be after its start date.');
  if (enrollOpen && enrollClose && enrollClose <= enrollOpen) throw ApiError.badRequest('Enrollment must close after it opens.');
  if (start && enrollClose && enrollClose > start) throw ApiError.badRequest('Enrollment must close before the training starts.');
}

async function enrollStudents(learningClass, studentIds, enrolledAt = new Date()) {
  if (!studentIds.length) return;
  const payment = learningClass.payment || {};
  await Enrollment.bulkWrite(studentIds.map((studentId) => ({
    updateOne: {
      filter: { learningClass: learningClass._id, student: studentId },
      update: {
        $setOnInsert: {
          status: 'enrolled',
          enrolledAt,
          paymentStatus: payment.enabled ? 'unpaid' : 'not_required',
          paymentAmount: payment.amount || 0,
          paymentCurrency: payment.currency || 'RWF',
        },
      },
      upsert: true,
    },
  })));
}

async function enrollmentMapFor(user, classes) {
  if (!user || isAdmin(user) || !classes.length) return new Map();
  const records = await Enrollment.find({
    student: user._id,
    learningClass: { $in: classes.map((item) => item._id) },
    status: 'enrolled',
  }).lean();
  return new Map(records.map((record) => [record.learningClass.toString(), record]));
}

async function classSessions(ids) {
  const sessions = await LiveSession.find({ learningClass: { $in: ids } }).sort({ startedAt: -1 }).lean();
  const liveByClass = new Map();
  const recentByClass = new Map();
  for (const session of sessions) {
    const key = session.learningClass.toString();
    if (!recentByClass.has(key)) recentByClass.set(key, session);
    if (session.status === 'live' && !liveByClass.has(key)) liveByClass.set(key, session);
  }
  return { liveByClass, recentByClass };
}

export const listPeople = asyncHandler(async (req, res) => {
  const users = await User.find({ role: 'student', isActive: true }).select('name email whatsapp country province').sort({ name: 1 }).limit(2000);
  res.json({ success: true, data: { people: users.map(personJson) } });
});

export const listClasses = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const includeArchived = admin && req.query.includeArchived === 'true';
  const filter = admin
    ? (includeArchived ? {} : { active: true })
    : { students: req.user._id, active: true };
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 24)));
  const [classes, total] = await Promise.all([
    LearningClass.find(filter).populate('students', 'name email whatsapp country province').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    LearningClass.countDocuments(filter),
  ]);
  const { liveByClass, recentByClass } = await classSessions(classes.map((item) => item._id));
  const enrollments = await enrollmentMapFor(req.user, classes);
  res.json({
    success: true,
    data: {
      classes: classes.map((item) => classJson(item, {
        liveSession: liveByClass.get(item._id.toString()),
        recentSession: recentByClass.get(item._id.toString()),
        enrollment: enrollments.get(item._id.toString()),
        user: req.user,
        includeRoster: admin,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const listCourses = asyncHandler(async (req, res) => {
  const admin = isAdmin(req.user);
  const manage = req.query.manage === 'true' && admin;
  const enrolledOnly = req.query.enrolled === 'true';
  const filter = manage
    ? {}
    : enrolledOnly
      ? { students: req.user._id, active: true }
      : { active: true, $or: [{ published: true }, { published: { $exists: false } }] };
  if (req.query.level) filter.level = req.query.level;
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
    LearningClass.find(filter).populate('students', 'name')
      .sort(req.query.sort === 'title' ? { title: 1 } : req.query.sort === 'popular' ? { students: -1, updatedAt: -1 } : req.query.sort === 'level' ? { level: 1, title: 1 } : { updatedAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    LearningClass.countDocuments(filter),
    LearningClass.distinct('subject', manage ? {} : { active: true, $or: [{ published: true }, { published: { $exists: false } }] }),
    LearningClass.distinct('trade', manage ? {} : { active: true, $or: [{ published: true }, { published: { $exists: false } }] }),
  ]);
  const enrollments = await enrollmentMapFor(req.user, items);
  res.json({
    success: true,
    data: {
      courses: items.map((item) => courseJson(item, req.user, enrollments.get(item._id.toString()))),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      subjects: subjects.filter(Boolean).sort(),
      trades: trades.filter(Boolean).sort(),
    },
  });
});

export const getCourse = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).lean();
  if (!item) throw ApiError.notFound('Training not found.');
  const enrollment = isAdmin(req.user) ? null : await getEnrollment(item._id, req.user._id);
  const enrolled = Boolean(enrollment) || (item.students || []).some((student) => student.toString() === req.user._id.toString());
  if (!isAdmin(req.user) && (!item.active || (item.published === false && !enrolled))) throw ApiError.notFound('Training not found.');
  res.json({ success: true, data: { course: courseJson(item, req.user, enrollment) } });
});

export const enrollInCourse = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only student accounts can enroll in trainings.');
  const studentId = req.user._id;
  const now = new Date();
  const item = await LearningClass.findOneAndUpdate(
    {
      _id: req.params.id,
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
  );
  if (!item) {
    const current = await LearningClass.findById(req.params.id).select('active published enrollmentOpen enrollmentOpensAt enrollmentClosesAt maxStudents students');
    if (!current || !current.active || current.published === false) throw ApiError.notFound('This training is not available for enrollment.');
    if (current.students.some((student) => student.toString() === studentId.toString())) throw ApiError.conflict('You are already enrolled in this training.');
    if (!current.enrollmentOpen) throw ApiError.conflict('Enrollment is closed for this training.');
    if (current.enrollmentOpensAt && current.enrollmentOpensAt > now) throw ApiError.conflict('Enrollment has not opened for this training yet.');
    if (current.enrollmentClosesAt && current.enrollmentClosesAt < now) throw ApiError.conflict('Enrollment has closed for this training.');
    if (current.students.length >= current.maxStudents) throw ApiError.conflict('This training has reached its enrollment capacity.');
    throw ApiError.conflict('Training enrollment could not be completed. Please retry.');
  }
  await enrollStudents(item, [studentId], now);
  const enrollment = await getEnrollment(item._id, studentId);
  await recordActivity(req, { action: 'course.enrolled', resourceType: 'class', resourceId: item._id, message: `Enrolled in ${item.title}.` });
  res.status(201).json({ success: true, data: { course: courseJson(item, req.user, enrollment), enrollment: enrollmentJson(enrollment, item) } });
});

export const cancelEnrollment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only student accounts can leave a training.');
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
  if (item.allowCancellation === false) throw ApiError.conflict('Leaving this training is disabled by the administrator.');
  if (await LiveSession.exists({ learningClass: item._id, status: 'live' })) throw ApiError.conflict('Wait for the live class to end before leaving this training.');
  const enrollment = await Enrollment.findOneAndUpdate(
    { learningClass: item._id, student: req.user._id, status: 'enrolled' },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true },
  );
  if (!enrollment) throw ApiError.notFound('You are not enrolled in this training.');
  await LearningClass.updateOne({ _id: item._id }, { $pull: { students: req.user._id } });
  await recordActivity(req, { action: 'course.left', resourceType: 'class', resourceId: item._id, message: `Left ${item.title}.` });
  res.json({ success: true, data: { enrollment: { status: 'cancelled' } } });
});

export const submitPaymentReference = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can submit a payment reference.');
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
  const enrollment = await getEnrollment(item._id, req.user._id);
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this training.');
  if (!item.payment?.enabled) throw ApiError.conflict('Payment is not required for this training.');
  if (['paid', 'waived'].includes(enrollment.paymentStatus)) throw ApiError.conflict('Your payment is already verified.');
  enrollment.paymentStatus = 'pending';
  enrollment.paymentReference = req.body.reference;
  enrollment.paymentNote = req.body.note || '';
  enrollment.paymentSubmittedAt = new Date();
  enrollment.paymentAmount = item.payment.amount || 0;
  enrollment.paymentCurrency = item.payment.currency || 'RWF';
  enrollment.paymentVerifiedAt = null;
  enrollment.paymentVerifiedBy = null;
  await enrollment.save();
  await recordActivity(req, { action: 'payment.submitted', resourceType: 'enrollment', resourceId: enrollment._id, message: `Submitted payment reference for ${item.title}.` });
  res.json({ success: true, data: { enrollment: enrollmentJson(enrollment, item) } });
});

export const updateCourseThumbnail = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP thumbnail.');
  if (req.file.size > 3 * 1024 * 1024) throw ApiError.badRequest('Training thumbnails must be 3 MB or smaller.');
  const format = IMAGE_FORMATS.find((item) => item.mime === req.file.mimetype && item.matches(req.file.buffer));
  if (!format) throw ApiError.badRequest('Thumbnail content must match a PNG, JPEG, or WebP image.');
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
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
    if (uploaded?.publicId) await deleteCloudinaryAsset({ publicId: uploaded.publicId, resourceType: 'image' }).catch((cleanupError) => console.warn('[storage] Could not remove unreferenced training thumbnail from Cloudinary:', cleanupError.message));
    throw error;
  }
  if (previousFile) await fs.unlink(path.join(COURSE_IMAGE_DIR, path.basename(previousFile))).catch(() => {});
  if (previousPublicId && config.cloudinary.enabled) await deleteCloudinaryAsset({ publicId: previousPublicId, resourceType: 'image' }).catch((error) => console.warn('[storage] Could not remove replaced training thumbnail from Cloudinary:', error.message));
  res.json({ success: true, data: { thumbnailUrl: item.thumbnailUrl || `/api/courses/${item._id}/thumbnail` } });
});

export const getCourseThumbnail = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).select('active published thumbnailFile thumbnailUrl');
  if (!item || (!item.thumbnailFile && !item.thumbnailUrl) || (!isAdmin(req.user) && (!item.active || item.published === false))) throw ApiError.notFound('Training thumbnail not found.');
  if (item.thumbnailUrl) return res.redirect(302, item.thumbnailUrl);
  const name = path.basename(item.thumbnailFile);
  if (name !== item.thumbnailFile) throw ApiError.notFound('Training thumbnail not found.');
  let buffer;
  try { buffer = await fs.readFile(path.join(COURSE_IMAGE_DIR, name)); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Training thumbnail not found.'); throw error; }
  const format = IMAGE_FORMATS.find((candidate) => candidate.matches(buffer));
  if (!format) throw ApiError.notFound('Training thumbnail is invalid.');
  res.setHeader('Content-Type', format.mime);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export const createClass = asyncHandler(async (req, res) => {
  const requestId = req.get('Idempotency-Key');
  if (requestId && !/^[a-f\d]{24}$/i.test(requestId)) throw ApiError.badRequest('Training creation request ID is invalid.');
  if (requestId) {
    const existing = await LearningClass.findById(requestId);
    if (existing) {
      if (existing.createdBy?.toString() !== req.user._id.toString()) throw ApiError.conflict('This training creation request ID is already in use.');
      return res.status(200).json({ success: true, data: { class: classJson(existing, { user: req.user, includeRoster: true }) } });
    }
  }
  validateClassDates(req.body);
  const students = await resolveStudents(req.body.studentIds || []);
  if (students.length > (req.body.maxStudents || 300)) throw ApiError.badRequest('The selected students exceed the training capacity.');
  const platformSettings = await getPlatformSettings();
  const item = new LearningClass({
    ...(requestId ? { _id: requestId } : {}),
    title: req.body.title,
    subject: req.body.subject,
    trade: req.body.trade || '',
    introduction: req.body.introduction || '',
    completionRequirements: req.body.completionRequirements || {},
    course: req.body.course || '',
    level: req.body.level || 'Training',
    description: req.body.description || '',
    students: students.map((student) => student._id),
    startsAt: req.body.startsAt || null,
    endsAt: req.body.endsAt || null,
    enrollmentOpensAt: req.body.enrollmentOpensAt || null,
    enrollmentClosesAt: req.body.enrollmentClosesAt || null,
    schedule: req.body.schedule || '',
    durationMinutes: req.body.durationMinutes,
    lateThresholdMinutes: req.body.lateThresholdMinutes,
    earlyThresholdPercent: req.body.earlyThresholdPercent,
    timezone: req.body.timezone,
    maxStudents: req.body.maxStudents,
    enrollmentOpen: req.body.enrollmentOpen,
    allowCancellation: req.body.allowCancellation,
    published: req.body.published !== false,
    payment: { ...platformSettings.payment, ...(req.body.payment || {}) },
    projectSubmission: req.body.projectSubmission || {},
    certificationAssessmentEnabled: Boolean(req.body.certificationAssessmentEnabled),
    assessmentAttempts: req.body.assessmentAttempts ?? platformSettings.assessment.attempts,
    assessmentPassMark: req.body.assessmentPassMark ?? platformSettings.assessment.passMark,
    assessmentLockdown: req.body.assessmentLockdown ?? platformSettings.assessment.lockdown,
    minimumAttendanceSessions: req.body.minimumAttendanceSessions ?? platformSettings.assessment.minimumAttendanceSessions,
    createdBy: req.user._id,
  });
  try {
    await item.save();
  } catch (error) {
    if (requestId && error?.code === 11000) {
      const existing = await LearningClass.findById(requestId);
      if (existing?.createdBy?.toString() === req.user._id.toString()) {
        return res.status(200).json({ success: true, data: { class: classJson(existing, { user: req.user, includeRoster: true }) } });
      }
    }
    throw error;
  }
  await enrollStudents(item, students.map((student) => student._id));
  await item.populate('students', 'name email whatsapp country province');
  await recordActivity(req, { action: 'class.created', resourceType: 'class', resourceId: item._id, message: `Created training ${item.title}.` });
  res.status(201).json({ success: true, data: { class: classJson(item, { user: req.user, includeRoster: true }) } });
});

export const updateClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
  if (req.body.studentIds !== undefined && await LiveSession.exists({ learningClass: item._id, status: 'live' })) {
    throw ApiError.conflict('End the live session before changing the student roster.');
  }
  const fields = [
    'title', 'subject', 'trade', 'introduction', 'completionRequirements', 'course', 'level', 'description',
    'active', 'published', 'startsAt', 'endsAt', 'enrollmentOpensAt', 'enrollmentClosesAt', 'schedule',
    'durationMinutes', 'lateThresholdMinutes', 'earlyThresholdPercent', 'timezone', 'maxStudents',
    'enrollmentOpen', 'allowCancellation', 'certificationAssessmentEnabled', 'assessmentAttempts',
    'assessmentPassMark', 'assessmentLockdown', 'minimumAttendanceSessions',
  ];
  for (const field of fields) if (req.body[field] !== undefined) item[field] = req.body[field];
  if (req.body.payment) Object.assign(item.payment, req.body.payment);
  if (req.body.projectSubmission) Object.assign(item.projectSubmission, req.body.projectSubmission);
  if (req.body.active === true) item.archivedAt = null;
  validateClassDates({ ...item.toObject(), ...req.body });

  let previousStudentIds = item.students.map(String);
  let addedStudentIds = [];
  if (req.body.studentIds !== undefined) {
    const students = await resolveStudents(req.body.studentIds);
    if (students.length > (req.body.maxStudents ?? item.maxStudents)) throw ApiError.badRequest('The selected students exceed the training capacity.');
    const nextIds = students.map((student) => student._id.toString());
    addedStudentIds = nextIds.filter((id) => !previousStudentIds.includes(id));
    const removedIds = previousStudentIds.filter((id) => !nextIds.includes(id));
    item.students = students.map((student) => student._id);
    if (addedStudentIds.length) await enrollStudents(item, addedStudentIds);
    if (removedIds.length) {
      await Enrollment.updateMany(
        { learningClass: item._id, student: { $in: removedIds }, status: 'enrolled' },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
      );
    }
  }

  if (!item.payment.enabled) {
    await Enrollment.updateMany(
      { learningClass: item._id, paymentStatus: { $in: ['unpaid', 'pending', 'rejected'] } },
      { $set: { paymentStatus: 'not_required' } },
    );
  } else {
    await Enrollment.updateMany(
      { learningClass: item._id, paymentStatus: 'not_required' },
      { $set: { paymentStatus: 'unpaid' } },
    );
    await Enrollment.updateMany(
      { learningClass: item._id },
      { $set: { paymentAmount: item.payment.amount || 0, paymentCurrency: item.payment.currency || 'RWF' } },
    );
  }

  await item.save();
  await item.populate('students', 'name email whatsapp country province');
  const additions = addedStudentIds.length ? await User.find({ _id: { $in: addedStudentIds } }).select('name') : [];
  await recordActivity(req, {
    action: 'class.updated',
    resourceType: 'class',
    resourceId: item._id,
    message: `Updated training ${item.title}${additions.length ? ` and added ${additions.map((student) => student.name).join(', ')}` : ''}.`,
  });
  res.json({ success: true, data: { class: classJson(item, { user: req.user, includeRoster: true }) } });
});

export const getClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id).populate('students', 'name email whatsapp country province');
  await assertClassAccess(item, req.user);
  const enrollment = isAdmin(req.user) ? null : await getEnrollment(item._id, req.user._id);
  const [liveSession, recentSession] = await Promise.all([
    LiveSession.findOne({ learningClass: item._id, status: 'live' }).sort({ startedAt: -1 }).lean(),
    LiveSession.findOne({ learningClass: item._id }).sort({ startedAt: -1 }).lean(),
  ]);
  res.json({
    success: true,
    data: {
      class: classJson(item, {
        liveSession,
        recentSession: isAdmin(req.user) ? recentSession : null,
        enrollment,
        user: req.user,
        includeRoster: isAdmin(req.user),
      }),
    },
  });
});

export const listClassSessions = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await assertClassAccess(item, req.user);
  const sessions = await LiveSession.find({ learningClass: item._id }).sort({ startedAt: -1 }).limit(100).lean();
  res.json({
    success: true,
    data: {
      sessions: sessions.map((session) => (isAdmin(req.user)
        ? sessionJson(session, { report: true })
        : learnerSessionJson(session, req.user))),
    },
  });
});

export const startSession = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
  if (!isAdmin(req.user)) throw ApiError.forbidden('Only an administrator can start a live class.');
  if (!item.active) throw ApiError.conflict('Archived trainings cannot start a new session.');
  const current = await LiveSession.findOne({ learningClass: item._id, status: 'live' });
  if (current) throw ApiError.conflict('This training already has a live session.');
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

async function getSessionContext(req) {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass',
    populate: [{ path: 'students', select: 'name email whatsapp country province' }],
  });
  if (!session) throw ApiError.notFound('Class session not found.');
  await assertClassAccess(session.learningClass, req.user);
  return session;
}

export const joinByCode = asyncHandler(async (req, res) => {
  const session = await LiveSession.findOne({ sessionCode: req.params.sessionCode }).populate({
    path: 'learningClass',
    populate: [{ path: 'students', select: 'name email whatsapp country province' }],
  });
  if (!session || session.status !== 'live') throw ApiError.notFound('This class link is no longer live.');
  await assertClassAccess(session.learningClass, req.user);
  const enrollment = isAdmin(req.user) ? null : await getEnrollment(session.learningClass._id, req.user._id);
  const state = isAdmin(req.user) ? null : paymentState(session.learningClass, enrollment);
  res.json({
    success: true,
    data: {
      session: sessionJson(session),
      class: classJson(session.learningClass, { enrollment, user: req.user, includeRoster: isAdmin(req.user) }),
      mediaConfigured: Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret),
      canJoinMedia: !state || state.allowed,
      paymentState: state,
      canShareScreen: isAdmin(req.user) || session.screenShareAllowed.some((studentId) => studentId.toString() === req.user._id.toString()),
    },
  });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await getSessionContext(req);
  const enrollment = isAdmin(req.user) ? null : await getEnrollment(session.learningClass._id, req.user._id);
  const state = isAdmin(req.user) ? null : paymentState(session.learningClass, enrollment);
  const data = {
    session: sessionJson(session),
    class: classJson(session.learningClass, { enrollment, user: req.user, includeRoster: isAdmin(req.user) }),
    mediaConfigured: Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret),
    canJoinMedia: !state || state.allowed,
    paymentState: state,
    canShareScreen: isAdmin(req.user) || session.screenShareAllowed.some((studentId) => studentId.toString() === req.user._id.toString()),
  };
  if (session.status === 'ended') {
    data.session = isAdmin(req.user)
      ? sessionJson(session, { report: true })
      : learnerSessionJson(session, req.user);
  }
  res.json({ success: true, data });
});

export const createLiveKitToken = asyncHandler(async (req, res) => {
  const session = await LiveSession.findById(req.params.sessionId).populate({
    path: 'learningClass',
    populate: [{ path: 'students', select: 'name email' }],
  });
  if (!session || session.status !== 'live') throw ApiError.notFound('This class session is no longer live.');
  await assertClassAccess(session.learningClass, req.user);
  await assertCanAttend(session.learningClass, req.user);
  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    throw ApiError.conflict('Live classroom media is not configured on this server.');
  }
  const room = `quicklink-${session._id.toString()}`;
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity: req.user._id.toString(),
    name: req.user.name,
    ttl: '2h',
    metadata: JSON.stringify({ role: req.user.role }),
  });
  const canShareScreen = isAdmin(req.user)
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
  const session = await getSessionContext(req);
  if (!isAdmin(req.user)) throw ApiError.forbidden('Only an administrator can end this live class.');
  if (session.status === 'ended') return res.json({ success: true, data: { session: sessionJson(session, { report: true }) } });

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
  const students = session.learningClass.students || [];
  const startedBy = await User.findById(session.startedBy).select('name email');
  const roster = startedBy ? [startedBy, ...students] : [...students];
  session.report.enrolledCount = students.length;
  const scheduledStart = session.learningClass.startsAt ? new Date(session.learningClass.startsAt).getTime() : null;
  const earlyMinimum = session.report.durationSeconds * ((session.learningClass.earlyThresholdPercent ?? 75) / 100);
  session.report.attendance = roster.map((person) => {
    const personId = person._id.toString();
    const record = attendanceByUser.get(personId);
    const isStudent = students.some((student) => student._id.toString() === personId);
    const late = Boolean(isStudent && record && scheduledStart && new Date(record.item.firstJoinedAt).getTime() > scheduledStart + (session.learningClass.lateThresholdMinutes ?? 15) * 60_000);
    const early = Boolean(isStudent && record && record.totalSeconds < earlyMinimum);
    const status = !record ? 'absent' : late ? 'late' : early ? 'early' : 'present';
    return {
      user: person._id,
      name: person.name,
      email: person.email,
      role: isStudent ? 'student' : 'admin',
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
  res.json({ success: true, data: { session: sessionJson(session, { report: true }) } });
});

export const getSessionReport = asyncHandler(async (req, res) => {
  const session = await getSessionContext(req);
  if (session.status !== 'ended') throw ApiError.conflict('The report is available after the administrator ends the session.');
  if (!isAdmin(req.user)) {
    const own = session.report?.attendance?.find((entry) => entry.user?.toString() === req.user._id.toString());
    return res.json({
      success: true,
      data: {
        session: {
          ...sessionJson(session),
          report: {
            durationSeconds: session.report?.durationSeconds || 0,
            attendance: own ? [own] : [],
            attendedCount: own?.attended ? 1 : 0,
            lateCount: own?.status === 'late' ? 1 : 0,
            earlyCount: own?.status === 'early' ? 1 : 0,
            excusedCount: own?.status === 'excused' ? 1 : 0,
            enrolledCount: session.report?.enrolledCount || 0,
          },
        },
        class: classJson(session.learningClass, { user: req.user }),
      },
    });
  }
  res.json({ success: true, data: { session: sessionJson(session, { report: true }), class: classJson(session.learningClass, { user: req.user, includeRoster: true }) } });
});

export const correctAttendance = asyncHandler(async (req, res) => {
  const session = await getSessionContext(req);
  if (!isAdmin(req.user)) throw ApiError.forbidden('Only an administrator can correct attendance.');
  if (session.status !== 'ended') throw ApiError.conflict('Attendance can be corrected after the session ends.');
  const entry = session.report.attendance.find((person) => person.user?.toString() === req.params.studentId);
  if (!entry || entry.role !== 'student') throw ApiError.notFound('Student attendance record not found.');
  entry.correctionHistory.push({ fromStatus: entry.status, toStatus: req.body.status, reason: req.body.reason, updatedBy: req.user._id, updatedAt: new Date() });
  entry.status = req.body.status;
  if (['present', 'late', 'early'].includes(req.body.status)) entry.attended = true;
  if (req.body.status === 'absent') entry.attended = false;
  session.report.attendedCount = session.report.attendance.filter((person) => person.attended && person.role === 'student').length;
  session.report.lateCount = session.report.attendance.filter((person) => person.status === 'late' && person.role === 'student').length;
  session.report.earlyCount = session.report.attendance.filter((person) => person.status === 'early' && person.role === 'student').length;
  session.report.excusedCount = session.report.attendance.filter((person) => person.status === 'excused' && person.role === 'student').length;
  await session.save();
  res.json({ success: true, data: { session: sessionJson(session, { report: true }) } });
});

export const removeAttendance = asyncHandler(async (req, res) => {
  const session = await getSessionContext(req);
  if (!isAdmin(req.user)) throw ApiError.forbidden('Only an administrator can remove attendance records.');
  if (session.status !== 'ended') throw ApiError.conflict('Attendance records can be removed after the session ends.');
  const personId = req.params.studentId;
  const before = session.report.attendance.length;
  session.report.attendance = session.report.attendance.filter((entry) => entry.user?.toString() !== personId);
  session.attendance = session.attendance.filter((entry) => entry.user?.toString() !== personId);
  if (session.report.attendance.length === before) throw ApiError.notFound('Attendance record not found.');
  session.report.attendedCount = session.report.attendance.filter((person) => person.attended && person.role === 'student').length;
  session.report.lateCount = session.report.attendance.filter((person) => person.status === 'late' && person.role === 'student').length;
  session.report.earlyCount = session.report.attendance.filter((person) => person.status === 'early' && person.role === 'student').length;
  session.report.excusedCount = session.report.attendance.filter((person) => person.status === 'excused' && person.role === 'student').length;
  await session.save();
  res.json({ success: true, data: { session: sessionJson(session, { report: true }) } });
});

export const archiveClass = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  if (!item) throw ApiError.notFound('Training not found.');
  if (await LiveSession.exists({ learningClass: item._id, status: 'live' })) throw ApiError.conflict('End the live session before archiving this training.');
  item.active = false;
  item.enrollmentOpen = false;
  item.archivedAt = new Date();
  await item.save();
  await recordActivity(req, { action: 'class.archived', resourceType: 'class', resourceId: item._id, message: `Archived training ${item.title}.` });
  res.json({ success: true, data: { class: { id: item.id, active: false, archivedAt: item.archivedAt } } });
});

export const permanentlyDeleteClass = asyncHandler(async (req, res) => {
  const item = await deleteClassRecords(req.params.id);
  await recordActivity(req, { action: 'class.deleted', resourceType: 'class', resourceId: item._id, message: `Permanently deleted training ${item.title}.` });
  res.json({ success: true, data: { class: { id: item._id.toString(), deleted: true } } });
});

export default {
  listPeople,
  listClasses,
  listCourses,
  getCourse,
  enrollInCourse,
  cancelEnrollment,
  submitPaymentReference,
  createClass,
  updateClass,
  archiveClass,
  permanentlyDeleteClass,
  updateCourseThumbnail,
  getCourseThumbnail,
  getClass,
  listClassSessions,
  startSession,
  joinByCode,
  getSession,
  createLiveKitToken,
  endSession,
  getSessionReport,
  correctAttendance,
  removeAttendance,
};
