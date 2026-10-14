import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';

// Public self-registration. New accounts are created in 'pending' state and
// cannot sign in until an account owner approves them.
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = new User({
    name,
    email,
    role: 'user',
    approvalStatus: 'pending',
  });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({
    success: true,
    data: {
      user: {
        name: user.name,
        email: user.email,
        approvalStatus: user.approvalStatus,
      },
      message: 'Registration received. An account owner will review and approve your account.',
    },
  });
});

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

  if (user.approvalStatus === 'pending') {
    throw ApiError.forbidden('Your account is awaiting approval by an account owner.');
  }
  if (user.approvalStatus === 'rejected') {
    throw ApiError.forbidden('Your registration was not approved.');
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

export default { register, login, me, changePassword };
