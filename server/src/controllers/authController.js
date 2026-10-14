import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Generic message so we never reveal whether the email exists.
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const ok = await user.verifyPassword(password);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    data: {
      token: signToken(user),
      user: user.toSafeJSON(),
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await user.verifyPassword(currentPassword);
  if (!ok) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  await user.setPassword(newPassword);
  await user.save();

  res.json({ success: true, data: { message: 'Password updated successfully' } });
});

export default { login, me, changePassword };
