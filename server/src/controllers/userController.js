import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { CourseCertificate } from '../models/CourseCertificate.js';
import { TeacherFollow } from '../models/TeacherFollow.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { permanentlyDeleteUser as deleteUserAccount } from '../services/permanentlyDeleteUser.js';
import { recordActivity } from '../services/activityLog.js';

// Account management is restricted to owners (enforced by route middleware).
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: { $in: ['admin', 'owner', 'teacher', 'student', 'user'] } }).sort({ createdAt: -1 });
  res.json({
    success: true,
    data: { users: users.map((u) => u.toSafeJSON()) },
  });
});

export const listTeachersToFollow = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can follow teachers.');
  const [teachers, follows] = await Promise.all([
    User.find({ role: 'teacher', isActive: true }).select('name email').sort({ name: 1 }).lean(),
    TeacherFollow.find({ follower: req.user._id }).select('teacher').lean(),
  ]);
  const followedIds = new Set(follows.map((follow) => follow.teacher.toString()));
  res.json({ success: true, data: { teachers: teachers.map((teacher) => ({
    id: teacher._id.toString(),
    name: teacher.name,
    email: teacher.email,
    following: followedIds.has(teacher._id.toString()),
  })) } });
});

export const followTeacher = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can follow teachers.');
  const teacher = await User.findOne({ _id: req.params.id, role: 'teacher', isActive: true }).select('_id');
  if (!teacher) throw ApiError.notFound('Active teacher not found.');
  try {
    await TeacherFollow.updateOne(
      { teacher: teacher._id, follower: req.user._id },
      { $setOnInsert: { teacher: teacher._id, follower: req.user._id } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  res.json({ success: true, data: { following: true } });
});

export const unfollowTeacher = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only students can follow teachers.');
  await TeacherFollow.deleteOne({ teacher: req.params.id, follower: req.user._id });
  res.json({ success: true, data: { following: false } });
});

export const listTeacherFollowers = asyncHandler(async (req, res) => {
  let teacherId = req.user._id;
  if (['admin', 'owner'].includes(req.user.role)) {
    if (!req.query.teacherId) throw ApiError.badRequest('Choose a teacher to view their followers.');
    teacherId = req.query.teacherId;
  } else if (req.user.role !== 'teacher') {
    throw ApiError.forbidden('Follower lists are available to teachers and admins.');
  }
  const followers = await TeacherFollow.find({ teacher: teacherId })
    .populate('follower', 'name email isActive')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: { followers: followers
    .filter((entry) => entry.follower?.isActive)
    .map((entry) => ({ id: entry.follower._id.toString(), name: entry.follower.name, email: entry.follower.email, followedAt: entry.createdAt })) } });
});

export const dashboardSummary = asyncHandler(async (req, res) => {
  const level = req.query.level && req.query.level !== 'all' ? req.query.level : null;
  const enrollmentOpen = req.query.enrollment === 'open' ? true : undefined;
  const classFilter = { active: true, ...(level ? { level } : {}), ...(enrollmentOpen === undefined ? {} : { enrollmentOpen }) };
  const [activeStudents, activeTeachers, pendingRegistrations, certificatesIssued, classes] = await Promise.all([
    User.countDocuments({ role: 'student', isActive: true }),
    User.countDocuments({ role: 'teacher', isActive: true }),
    User.countDocuments({ role: 'student', registrationStatus: 'pending' }),
    CourseCertificate.countDocuments({}),
    LearningClass.find(classFilter).select('_id students').lean(),
  ]);
  const classIds = classes.map((item) => item._id);
  const [liveClasses, followerCounts, teachers, enrolledStudents] = await Promise.all([
    classIds.length ? LiveSession.countDocuments({ learningClass: { $in: classIds }, status: 'live' }) : 0,
    TeacherFollow.aggregate([
      { $lookup: { from: User.collection.name, localField: 'follower', foreignField: '_id', as: 'follower' } },
      { $unwind: '$follower' },
      { $match: { 'follower.role': 'student', 'follower.isActive': true } },
      { $group: { _id: '$teacher', followers: { $sum: 1 } } },
    ]),
    User.find({ role: 'teacher', isActive: true }).select('name').sort({ name: 1 }).lean(),
    classIds.length ? LearningClass.aggregate([
      { $match: { _id: { $in: classIds } } },
      { $unwind: '$students' },
      { $lookup: { from: User.collection.name, localField: 'students', foreignField: '_id', as: 'enrolledStudent' } },
      { $unwind: '$enrolledStudent' },
      { $match: { 'enrolledStudent.role': 'student', 'enrolledStudent.isActive': true } },
      { $count: 'total' },
    ]) : [],
  ]);
  const followerCountByTeacher = new Map(followerCounts.map((entry) => [entry._id.toString(), entry.followers]));
  res.json({ success: true, data: {
    activeStudents,
    activeTeachers,
    activeClasses: classes.length,
    currentEnrollments: enrolledStudents[0]?.total || 0,
    pendingRegistrations,
    liveClasses,
    certificatesIssued,
    teachersByFollowers: teachers.map((teacher) => ({
      teacherId: teacher._id.toString(),
      name: teacher.name,
      followers: followerCountByTeacher.get(teacher._id.toString()) || 0,
    })).sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name)),
  } });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, educationLevel } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const { role = 'student' } = req.body;
  const user = new User({ name, email, role, educationLevel: role === 'student' ? educationLevel || null : null, registrationStatus: 'approved' });
  await user.setPassword(password);
  try { await user.save(); }
  catch (error) { if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.'); throw error; }

  res.status(201).json({ success: true, data: { user: user.toSafeJSON() } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, role, isActive, password, educationLevel, registrationStatus } = req.body;

  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  if (['admin', 'owner'].includes(user.role)) throw ApiError.forbidden('Owner accounts cannot be edited here.');
  if (String(req.user._id) === String(user._id) && isActive === false) throw ApiError.badRequest('You cannot deactivate your own account.');

  if (name !== undefined) user.name = name;
  if (educationLevel !== undefined) {
    if ((role || user.role) !== 'student' && educationLevel !== null) throw ApiError.badRequest('Education level is only available for student accounts.');
    user.educationLevel = educationLevel;
  }
  if (email !== undefined && email !== user.email) {
    if (await User.exists({ email, _id: { $ne: user._id } })) throw ApiError.conflict('An account with this email already exists.');
    user.email = email;
  }
  if (role !== undefined && role !== user.role) {
    if (user.role === 'student' && role === 'teacher') {
      await Promise.all([
        LearningClass.updateMany({ students: user._id }, { $pull: { students: user._id } }),
        TeacherFollow.deleteMany({ follower: user._id }),
      ]);
      if (user.registrationStatus !== 'approved') {
        user.registrationStatus = 'approved';
        user.isActive = true;
      }
      user.tokenVersion += 1;
    } else {
      const assignedClass = await LearningClass.exists({ $or: [{ teacher: user._id }, { teachers: user._id }] });
      if (assignedClass) throw ApiError.conflict('Reassign this teacherâ€™s classes before changing their role.');
      await TeacherFollow.deleteMany({ teacher: user._id });
      user.tokenVersion += 1;
    }
    user.role = role;
    if (role !== 'student') user.educationLevel = null;
  }
  if (registrationStatus !== undefined) {
    if (user.role !== 'student') throw ApiError.badRequest('Only student registrations can be approved or rejected.');
    if (user.registrationStatus !== registrationStatus) user.tokenVersion += 1;
    user.registrationStatus = registrationStatus;
    user.isActive = registrationStatus === 'approved';
  }
  if (isActive !== undefined && user.isActive !== isActive) {
    if (isActive && user.registrationStatus !== 'approved') throw ApiError.badRequest('Approve this student registration before enabling the account.');
    user.isActive = isActive;
    user.tokenVersion += 1;
  }
  if (password) {
    await user.setPassword(password);
  }

  try { await user.save(); }
  catch (error) { if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.'); throw error; }
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) throw ApiError.badRequest('You cannot permanently delete your own account.');
  const user = await deleteUserAccount(req.params.id);
  await recordActivity(req, {
    action: 'user.permanently_deleted',
    resourceType: 'user',
    message: `Permanently deleted a ${user.role} account and its personal records.`,
  });
  res.json({ success: true, data: { user: { id: user._id.toString(), deleted: true } } });
});

export default {
  listUsers,
  listTeachersToFollow,
  followTeacher,
  unfollowTeacher,
  listTeacherFollowers,
  dashboardSummary,
  createUser,
  updateUser,
};
