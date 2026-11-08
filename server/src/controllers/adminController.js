import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { Enrollment } from '../models/Enrollment.js';
import { LiveSession } from '../models/LiveSession.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { ProjectSubmission } from '../models/ProjectSubmission.js';
import { CertificationAssessmentAttempt } from '../models/CertificationAssessmentAttempt.js';
import { getPlatformSettings, updatePlatformSettings } from '../services/settings.js';
import { recordActivity } from '../services/activityLog.js';
import { notifyUsers } from '../services/notifications.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function enrollmentJson(enrollment) {
  const student = enrollment.student;
  const learningClass = enrollment.learningClass;
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
    student: student ? {
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      whatsapp: student.whatsapp || '',
      country: student.country || '',
      province: student.province || '',
    } : null,
    class: learningClass ? {
      id: learningClass._id.toString(),
      title: learningClass.title,
      subject: learningClass.subject,
      level: learningClass.level,
      startsAt: learningClass.startsAt,
      endsAt: learningClass.endsAt,
      paymentEnabled: Boolean(learningClass.payment?.enabled),
    } : null,
  };
}

export const listActivity = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.resourceType) filter.resourceType = req.query.resourceType;
  const [entries, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: {
    activity: entries.map((entry) => ({
      id: entry._id.toString(),
      actorName: entry.actorName,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      message: entry.message,
      metadata: entry.metadata,
      ip: entry.ip,
      createdAt: entry.createdAt,
    })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  } });
});

export const getDashboard = asyncHandler(async (_req, res) => {
  const [students, activeStudents, trainings, enrollments, pendingPayments, liveClasses, certificates, projectSubmissions] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'student', isActive: true }),
    LearningClass.countDocuments({ active: true }),
    Enrollment.countDocuments({ status: 'enrolled' }),
    Enrollment.countDocuments({ status: 'enrolled', paymentStatus: 'pending' }),
    LiveSession.countDocuments({ status: 'live' }),
    CourseCertificate.countDocuments({ revokedAt: null }),
    ProjectSubmission.countDocuments({}),
  ]);
  const revenue = await Enrollment.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $group: { _id: '$paymentCurrency', total: { $sum: '$paymentAmount' } } },
  ]);
  const [recentEnrollments, upcomingTrainings, recentActivity] = await Promise.all([
    Enrollment.find({ status: 'enrolled' })
      .populate('student', 'name email whatsapp country province')
      .populate('learningClass', 'title subject level startsAt payment')
      .sort({ createdAt: -1 }).limit(6).lean(),
    LearningClass.find({ active: true, startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(5).select('title subject level startsAt students thumbnailUrl thumbnailFile').lean(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  res.json({
    success: true,
    data: {
      stats: {
        students,
        activeStudents,
        trainings,
        enrollments,
        pendingPayments,
        liveClasses,
        certificates,
        projectSubmissions,
        revenueByCurrency: revenue.map((item) => ({ currency: item._id || 'RWF', total: item.total })),
      },
      recentEnrollments: recentEnrollments.map(enrollmentJson),
      upcomingTrainings: upcomingTrainings.map((item) => ({
        id: item._id.toString(),
        title: item.title,
        subject: item.subject,
        level: item.level,
        thumbnailUrl: item.thumbnailUrl || (item.thumbnailFile ? `/api/courses/${item._id}/thumbnail` : ''),
        startsAt: item.startsAt,
        enrolledCount: (item.students || []).length,
      })),
      recentActivity: recentActivity.map((entry) => ({
        id: entry._id.toString(),
        actorName: entry.actorName,
        action: entry.action,
        message: entry.message,
        createdAt: entry.createdAt,
      })),
    },
  });
});

export const listStudents = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const filter = { role: 'student' };
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;
  if (req.query.search) {
    const search = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: search }, { email: search }, { whatsapp: search }, { country: search }, { province: search }];
  }
  const [students, total] = await Promise.all([
    User.find(filter).select('name email whatsapp country province isActive createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = students.map((student) => student._id);
  const [enrollmentCounts, certificateCounts] = await Promise.all([
    Enrollment.aggregate([
      { $match: { student: { $in: ids }, status: 'enrolled' } },
      { $group: { _id: '$student', count: { $sum: 1 } } },
    ]),
    CourseCertificate.aggregate([
      { $match: { student: { $in: ids }, revokedAt: null } },
      { $group: { _id: '$student', count: { $sum: 1 } } },
    ]),
  ]);
  const enrollmentMap = new Map(enrollmentCounts.map((item) => [item._id.toString(), item.count]));
  const certificateMap = new Map(certificateCounts.map((item) => [item._id.toString(), item.count]));
  res.json({
    success: true,
    data: {
      students: students.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        whatsapp: student.whatsapp || '',
        country: student.country || '',
        province: student.province || '',
        active: student.isActive,
        enrollments: enrollmentMap.get(student._id.toString()) || 0,
        certificates: certificateMap.get(student._id.toString()) || 0,
        createdAt: student.createdAt,
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getStudentDetail = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('name email whatsapp country province isActive createdAt lastLoginAt').lean();
  if (!student) throw ApiError.notFound('Student not found.');
  const enrollments = await Enrollment.find({ student: student._id })
    .populate('learningClass', 'title subject level startsAt endsAt payment active')
    .sort({ createdAt: -1 }).lean();
  const classIds = enrollments.map((enrollment) => enrollment.learningClass?._id).filter(Boolean);
  const [certificates, projectSubmissions, attempts, sessions] = await Promise.all([
    CourseCertificate.find({ student: student._id }).sort({ issuedAt: -1 }).lean(),
    ProjectSubmission.find({ student: student._id }).populate('learningClass', 'title').lean(),
    CertificationAssessmentAttempt.find({ student: student._id }).sort({ submittedAt: -1 }).populate('course', 'title').lean(),
    classIds.length ? LiveSession.find({ learningClass: { $in: classIds }, status: 'ended' }).select('learningClass report.attendance startedAt').lean() : [],
  ]);
  const attendance = new Map();
  for (const session of sessions) {
    const record = session.report?.attendance?.find((entry) => entry.user?.toString() === student._id.toString());
    if (!record) continue;
    const key = session.learningClass.toString();
    const current = attendance.get(key) || { attended: 0, totalSeconds: 0, late: 0 };
    current.attended += record.attended ? 1 : 0;
    current.totalSeconds += record.totalSeconds || 0;
    current.late += record.status === 'late' ? 1 : 0;
    attendance.set(key, current);
  }
  res.json({
    success: true,
    data: {
      student: {
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        whatsapp: student.whatsapp || '',
        country: student.country || '',
        province: student.province || '',
        active: student.isActive,
        createdAt: student.createdAt,
        lastLoginAt: student.lastLoginAt || null,
      },
      enrollments: enrollments.map((enrollment) => ({
        ...enrollmentJson(enrollment),
        attendance: enrollment.learningClass ? attendance.get(enrollment.learningClass._id.toString()) || { attended: 0, totalSeconds: 0, late: 0 } : null,
      })),
      certificates: certificates.map((certificate) => ({
        id: certificate._id.toString(),
        code: certificate.code,
        courseTitle: certificate.courseTitle,
        level: certificate.level,
        issuedAt: certificate.issuedAt,
        revoked: Boolean(certificate.revokedAt),
      })),
      projectSubmissions: projectSubmissions.map((submission) => ({
        id: submission._id.toString(),
        classTitle: submission.learningClass?.title || '',
        linkUrl: submission.linkUrl,
        description: submission.description,
        status: submission.status,
        submittedAt: submission.submittedAt,
      })),
      assessmentAttempts: attempts.map((attempt) => ({
        id: attempt._id.toString(),
        courseTitle: attempt.course?.title || '',
        attemptNumber: attempt.attemptNumber,
        score: attempt.score,
        passed: attempt.passed,
        submittedAt: attempt.submittedAt,
      })),
    },
  });
});

export const listEnrollments = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const filter = {};
  if (req.query.classId) filter.learningClass = req.query.classId;
  if (req.query.studentId) filter.student = req.query.studentId;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const search = new RegExp(escapeRegex(req.query.search), 'i');
    const [studentIds, classIds] = await Promise.all([
      User.find({ role: 'student', $or: [{ name: search }, { email: search }, { whatsapp: search }, { country: search }, { province: search }] }).distinct('_id'),
      LearningClass.find({ $or: [{ title: search }, { subject: search }] }).distinct('_id'),
    ]);
    filter.$or = [{ student: { $in: studentIds } }, { learningClass: { $in: classIds } }];
  }
  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student', 'name email whatsapp country province')
      .populate('learningClass', 'title subject level startsAt endsAt payment')
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Enrollment.countDocuments(filter),
  ]);
  const classIds = [...new Set(enrollments.map((enrollment) => enrollment.learningClass?._id?.toString()).filter(Boolean))];
  const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.student?._id?.toString()).filter(Boolean))];
  const [sessions, certificates] = await Promise.all([
    classIds.length ? LiveSession.find({ learningClass: { $in: classIds }, status: 'ended' }).select('learningClass report.attendance').lean() : [],
    classIds.length && studentIds.length ? CourseCertificate.find({ course: { $in: classIds }, student: { $in: studentIds } }).select('course student revokedAt code').lean() : [],
  ]);
  const attendance = new Map();
  const sessionTotals = new Map();
  for (const session of sessions) {
    const classKey = session.learningClass.toString();
    sessionTotals.set(classKey, (sessionTotals.get(classKey) || 0) + 1);
    for (const record of session.report?.attendance || []) {
      if (!record.attended) continue;
      const key = `${classKey}:${record.user.toString()}`;
      attendance.set(key, (attendance.get(key) || 0) + 1);
    }
  }
  const certificateMap = new Map(certificates.map((certificate) => [`${certificate.course.toString()}:${certificate.student.toString()}`, certificate]));
  res.json({
    success: true,
    data: {
      enrollments: enrollments.map((enrollment) => {
        const classKey = enrollment.learningClass?._id?.toString() || '';
        const studentKey = enrollment.student?._id?.toString() || '';
        const certificate = certificateMap.get(`${classKey}:${studentKey}`);
        return {
          ...enrollmentJson(enrollment),
          attendance: { attended: attendance.get(`${classKey}:${studentKey}`) || 0, sessions: sessionTotals.get(classKey) || 0 },
          certificate: certificate ? { id: certificate._id.toString(), code: certificate.code, revoked: Boolean(certificate.revokedAt) } : null,
        };
      }),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate('student', 'name email')
    .populate('learningClass', 'title');
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  if (!enrollment.learningClass) throw ApiError.conflict('This training no longer exists.');
  enrollment.paymentStatus = req.body.status;
  enrollment.paymentVerifiedAt = req.body.status === 'pending' ? null : new Date();
  enrollment.paymentVerifiedBy = req.body.status === 'pending' ? null : req.user._id;
  if (req.body.note !== undefined) enrollment.paymentNote = req.body.note;
  await enrollment.save();
  const messages = {
    paid: ['Payment confirmed', `Your payment for ${enrollment.learningClass.title} has been confirmed. You can now join all live classes.`],
    waived: ['Payment waived', `Your payment requirement for ${enrollment.learningClass.title} has been waived. You can now join all live classes.`],
    rejected: ['Payment needs attention', `Your payment reference for ${enrollment.learningClass.title} was not accepted. Please review the note and submit again.`],
    pending: ['Payment under review', `Your payment reference for ${enrollment.learningClass.title} is under review.`],
  };
  if (messages[req.body.status]) {
    const [title, message] = messages[req.body.status];
    await notifyUsers([enrollment.student._id], { type: 'account', title, message, href: `/courses/${enrollment.learningClass._id}` });
  }
  await recordActivity(req, {
    action: `payment.${req.body.status}`,
    resourceType: 'enrollment',
    resourceId: enrollment._id,
    message: `Set payment to ${req.body.status} for ${enrollment.student?.name || 'a student'} in ${enrollment.learningClass.title}.`,
  });
  res.json({ success: true, data: { enrollment: enrollmentJson(await enrollment.populate([{ path: 'student', select: 'name email whatsapp country province' }, { path: 'learningClass', select: 'title subject level startsAt endsAt payment' }])) } });
});

export const createEnrollment = asyncHandler(async (req, res) => {
  const [student, learningClass] = await Promise.all([
    User.findOne({ _id: req.body.studentId, role: 'student', isActive: true }).select('_id name email'),
    LearningClass.findById(req.body.classId).select('_id title payment students'),
  ]);
  if (!student) throw ApiError.notFound('Active student not found.');
  if (!learningClass) throw ApiError.notFound('Training not found.');
  let enrollment = await Enrollment.findOne({ student: student._id, learningClass: learningClass._id });
  if (enrollment?.status === 'enrolled') throw ApiError.conflict('This student is already enrolled in this training.');
  const paymentRequired = learningClass.payment?.enabled === true;
  const paymentStatus = paymentRequired ? 'unpaid' : 'not_required';
  if (enrollment) {
    enrollment.status = 'enrolled';
    enrollment.enrolledAt = new Date();
    enrollment.cancelledAt = null;
    enrollment.paymentStatus = paymentStatus;
    enrollment.paymentAmount = paymentRequired ? Number(learningClass.payment.amount || 0) : 0;
    enrollment.paymentCurrency = learningClass.payment.currency || 'RWF';
    enrollment.paymentReference = '';
    enrollment.paymentNote = '';
    enrollment.paymentSubmittedAt = null;
    enrollment.paymentVerifiedAt = null;
    enrollment.paymentVerifiedBy = null;
    await enrollment.save();
  } else {
    [enrollment] = await Enrollment.create([{
      student: student._id,
      learningClass: learningClass._id,
      paymentStatus,
      paymentAmount: paymentRequired ? Number(learningClass.payment.amount || 0) : 0,
      paymentCurrency: learningClass.payment.currency || 'RWF',
    }]);
  }
  await LearningClass.updateOne({ _id: learningClass._id }, { $addToSet: { students: student._id } });
  await recordActivity(req, { action: 'enrollment.created', resourceType: 'enrollment', resourceId: enrollment._id, message: `Enrolled ${student.name} in ${learningClass.title}.` });
  const populated = await Enrollment.findById(enrollment._id).populate('student', 'name email whatsapp country province').populate('learningClass', 'title subject level startsAt endsAt payment').lean();
  res.status(201).json({ success: true, data: { enrollment: enrollmentJson(populated) } });
});

export const deleteEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id).populate('student', 'name').populate('learningClass', 'title');
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');
  await Promise.all([
    Enrollment.deleteOne({ _id: enrollment._id }),
    enrollment.learningClass && enrollment.student
      ? LearningClass.updateOne({ _id: enrollment.learningClass._id }, { $pull: { students: enrollment.student._id } })
      : Promise.resolve(),
  ]);
  await recordActivity(req, { action: 'enrollment.deleted', resourceType: 'enrollment', resourceId: enrollment._id, message: `Removed ${enrollment.student?.name || 'a student'} from ${enrollment.learningClass?.title || 'a training'}.` });
  res.json({ success: true, data: { deleted: true, id: req.params.id } });
});

export const getSettings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { settings: await getPlatformSettings({ fresh: true }) } });
});

export const saveSettings = asyncHandler(async (req, res) => {
  const settings = await updatePlatformSettings(req.body, req.user);
  await recordActivity(req, {
    action: 'settings.updated',
    resourceType: 'settings',
    message: 'Platform assessment, payment, and certificate settings were updated.',
    metadata: settings,
  });
  res.json({ success: true, data: { settings } });
});

export default {
  listActivity,
  getDashboard,
  listStudents,
  getStudentDetail,
  listEnrollments,
  verifyPayment,
  createEnrollment,
  deleteEnrollment,
  getSettings,
  saveSettings,
};
