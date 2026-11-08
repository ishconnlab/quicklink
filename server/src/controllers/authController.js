import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';
import { normalizeRole } from '../security/roles.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if ((user.registrationStatus || 'approved') === 'pending') throw ApiError.forbidden('Your student registration is waiting for admin approval.');
  if (user.registrationStatus === 'rejected') throw ApiError.forbidden('This student registration was not approved. Contact the QuickLink administrator.');
  if (!user.isActive) throw ApiError.forbidden('This account is disabled. Contact the QuickLink administrator.');
  user.role = normalizeRole(user.role);

  user.lastLoginAt = new Date();
  await user.save();
  res.json({ success: true, data: { token: signToken(user), user: user.toSafeJSON() } });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, whatsapp, country, province } = req.body;
  try {
    const user = new User({
      name,
      email,
      whatsapp,
      country,
      province,
      role: 'student',
      isActive: true,
      registrationStatus: 'approved',
    });
    await user.setPassword(password);
    await user.save();
    res.status(201).json({
      success: true,
      data: {
        token: signToken(user),
        user: user.toSafeJSON(),
        message: 'Your QuickLink student account is ready. Welcome aboard.',
      },
    });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.');
    throw error;
  }
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.unauthorized();
  for (const field of ['name', 'whatsapp', 'country', 'province']) {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  }
  await user.save();
  res.json({ success: true, data: { user: user.toSafeJSON() } });
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

export default { login, register, me, updateProfile, changePassword, logout };
