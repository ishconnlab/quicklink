import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Any authenticated user may list accounts (same role, same permissions).
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({
    success: true,
    data: { users: users.map((u) => u.toSafeJSON()) },
  });
});

// Create a new account. No public registration: this route requires auth.
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ success: true, data: { user: user.toSafeJSON() } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, isActive, password } = req.body;

  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  if (name !== undefined) user.name = name;
  if (isActive !== undefined) user.isActive = !!isActive;
  if (password) {
    await user.setPassword(password);
  }

  await user.save();
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export default { listUsers, createUser, updateUser };
