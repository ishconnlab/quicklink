import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Account management is restricted to owners (enforced by route middleware).
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({
    success: true,
    data: { users: users.map((u) => u.toSafeJSON()) },
  });
});

export const listPending = asyncHandler(async (_req, res) => {
  const users = await User.find({ approvalStatus: 'pending' }).sort({ createdAt: 1 });
  res.json({
    success: true,
    data: { users: users.map((u) => u.toSafeJSON()) },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = new User({ name, email, role: 'user', approvalStatus: 'approved' });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ success: true, data: { user: user.toSafeJSON() } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, isActive, password, role } = req.body;

  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  if (name !== undefined) user.name = name;
  if (isActive !== undefined) user.isActive = !!isActive;
  if (role !== undefined) user.role = role;
  if (password) {
    await user.setPassword(password);
  }

  await user.save();
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const approveUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  user.approvalStatus = 'approved';
  user.isActive = true;
  await user.save();

  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const rejectUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  user.approvalStatus = 'rejected';
  user.isActive = false;
  await user.save();

  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export default {
  listUsers,
  listPending,
  createUser,
  updateUser,
  approveUser,
  rejectUser,
};
