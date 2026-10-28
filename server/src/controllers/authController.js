import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if ((user.registrationStatus || 'approved') === 'pending') throw ApiError.forbidden('Your student registration is waiting for admin approval.');
  if (user.registrationStatus === 'rejected') throw ApiError.forbidden('This student registration was not approved. Contact the QuickLink administrator.');
  if (!user.isActive) throw ApiError.forbidden('This account is disabled. Contact the QuickLink administrator.');
  if (!['owner', 'teacher', 'student', 'user'].includes(user.role)) {
    throw ApiError.forbidden('This account does not have access to QuickLink Learning.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  res.json({ success: true, data: { token: signToken(user), user: user.toSafeJSON() } });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, educationLevel } = req.body;
  try {
    const user = new User({ name, email, educationLevel, role: 'student', isActive: false, registrationStatus: 'pending' });
    await user.setPassword(password);
    await user.save();
    res.status(202).json({ success: true, data: { user: user.toSafeJSON(), message: 'Registration received. An administrator must approve your account before you can sign in.' } });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.');
    throw error;
  }
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await user.setPassword(req.body.newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ success: true, data: { message: 'Password updated successfully' } });
});

export const logout = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.json({ success: true, data: { message: 'Signed out successfully' } });
});

export default { login, me, changePassword };
