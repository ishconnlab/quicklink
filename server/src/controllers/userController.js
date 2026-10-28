import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Account management is restricted to owners (enforced by route middleware).
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: { $in: ['owner', 'teacher', 'student', 'user'] } }).sort({ createdAt: -1 });
  res.json({
    success: true,
    data: { users: users.map((u) => u.toSafeJSON()) },
  });
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
  if (user.role === 'owner') throw ApiError.forbidden('Owner accounts cannot be edited here.');
  if (String(req.user._id) === String(user._id) && isActive === false) throw ApiError.badRequest('You cannot deactivate your own account.');

  if (name !== undefined) user.name = name;
  if (educationLevel !== undefined) {
    if (user.role !== 'student' && educationLevel !== null) throw ApiError.badRequest('Education level is only available for student accounts.');
    user.educationLevel = educationLevel;
  }
  if (email !== undefined && email !== user.email) {
    if (await User.exists({ email, _id: { $ne: user._id } })) throw ApiError.conflict('An account with this email already exists.');
    user.email = email;
  }
  if (role !== undefined && role !== user.role) {
    const classMembership = await LearningClass.exists({ $or: [{ teacher: user._id }, { teachers: user._id }, { students: user._id }] });
    if (classMembership) throw ApiError.conflict('Remove this person from all class rosters before changing their role.');
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

// Account removal is a reversible deactivation so class and attendance history remains intact.
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'owner') throw ApiError.forbidden('Owner accounts cannot be removed here.');
  if (String(req.user._id) === String(user._id)) throw ApiError.badRequest('You cannot remove your own account.');
  if (user.isActive) {
    user.isActive = false;
    user.tokenVersion += 1;
    await user.save();
  }
  res.json({ success: true, data: { user: user.toSafeJSON(), message: 'Account deactivated. Historical class and attendance records are retained.' } });
});

export default {
  listUsers,
  createUser,
  updateUser,
};
