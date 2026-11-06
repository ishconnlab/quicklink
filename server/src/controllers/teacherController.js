import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { TeacherFollow } from '../models/TeacherFollow.js';
import { User } from '../models/User.js';
import { isAdmin } from '../security/roles.js';

export const teacherDashboard = asyncHandler(async (req, res) => {
  let teacherId = req.user._id;
  if (isAdmin(req.user)) {
    teacherId = req.query.teacherId || null;
    if (!teacherId) {
      const fallback = await User.findOne({ role: 'teacher', isActive: true }).sort({ createdAt: 1 }).select('_id').lean();
      teacherId = fallback?._id || req.user._id;
    }
  } else if (req.user.role !== 'teacher') {
    throw ApiError.forbidden('Teacher dashboards are available to teachers and administrators.');
  }

  const classFilter = isAdmin(req.user) && !req.query.teacherId
    ? { active: true }
    : { active: true, $or: [{ teacher: teacherId }, { teachers: teacherId }] };
  const classes = await LearningClass.find(classFilter)
    .select('title course subject level active startsAt schedule students enrollmentOpen maxStudents createdAt')
    .sort({ startsAt: 1, createdAt: -1 })
    .lean();
  const classIds = classes.map((item) => item._id);
  const formIds = classIds.length
    ? await TrainingRegistrationForm.find({ learningClass: { $in: classIds } }).distinct('_id')
    : [];

  const registrationFilter = formIds.length ? { form: { $in: formIds } } : { form: { $in: [] } };
  const [
    statusCounts,
    recentRegistrations,
    liveSessions,
    certificatesIssued,
    pendingSubmissions,
    followers,
    upcomingClasses,
  ] = await Promise.all([
    formIds.length ? TrainingRegistration.aggregate([
      { $match: registrationFilter },
      { $group: { _id: { $ifNull: ['$status', 'PENDING'] }, count: { $sum: 1 } } },
    ]) : [],
    formIds.length ? TrainingRegistration.find(registrationFilter)
      .populate({ path: 'form', select: 'title learningClass', populate: { path: 'learningClass', select: 'title' } })
      .sort({ createdAt: -1 }).limit(10).lean() : [],
    classIds.length ? LiveSession.countDocuments({ learningClass: { $in: classIds }, status: 'live' }) : 0,
    classIds.length ? CourseCertificate.countDocuments({ course: { $in: classIds } }) : 0,
    classIds.length ? AssignmentSubmission.countDocuments({
      assignment: { $in: await Assignment.find({ learningClass: { $in: classIds } }).distinct('_id') },
      status: 'submitted',
    }) : 0,
    isAdmin(req.user) ? 0 : TeacherFollow.countDocuments({ teacher: teacherId }),
    classes.filter((item) => item.startsAt && new Date(item.startsAt) >= new Date()).slice(0, 5).map((item) => ({
      id: item._id.toString(),
      title: item.title,
      course: item.course || '',
      startsAt: item.startsAt,
      schedule: item.schedule || '',
      level: item.level,
      subject: item.subject,
    })),
  ]);

  const statuses = Object.fromEntries(statusCounts.map((row) => [row._id, row.count]));
  const pendingRegistrations = (statuses.PENDING || 0) + (statuses.APPROVED || 0);
  const enrolledRegistrations = (statuses.ENROLLED || 0) + (statuses.INVITED || 0) + (statuses.ATTENDED || 0) + (statuses.COMPLETED || 0);
  const uniqueStudents = new Set(classes.flatMap((item) => (item.students || []).map(String))).size;
  const capacity = classes.reduce((sum, item) => sum + (item.maxStudents || 0), 0);

  res.json({ success: true, data: {
    teacherId: teacherId?.toString() || null,
    stats: {
      classes: classes.length,
      students: uniqueStudents,
      capacity,
      liveSessions,
      pendingRegistrations,
      enrolledRegistrations,
      certificatesIssued,
      pendingSubmissions,
      followers,
    },
    statusBreakdown: Object.entries({
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      ENROLLED: 0,
      INVITED: 0,
      ATTENDED: 0,
      COMPLETED: 0,
      ...statuses,
    }).map(([status, count]) => ({ status, count })),
    classes: classes.slice(0, 20).map((item) => ({
      id: item._id.toString(),
      title: item.title,
      course: item.course || '',
      subject: item.subject,
      level: item.level,
      startsAt: item.startsAt,
      schedule: item.schedule || '',
      enrolledCount: (item.students || []).length,
      capacity: item.maxStudents || 0,
      enrollmentOpen: item.enrollmentOpen !== false,
    })),
    upcomingClasses,
    recentRegistrations: recentRegistrations.map((entry) => ({
      id: entry._id.toString(),
      name: entry.name,
      email: entry.email,
      whatsapp: entry.whatsapp,
      status: entry.status || 'PENDING',
      createdAt: entry.createdAt,
      formId: entry.form?._id?.toString() || entry.form?.toString() || null,
      formTitle: entry.form?.title || '',
      classTitle: entry.form?.learningClass?.title || '',
    })),
  } });
});

export default { teacherDashboard };
