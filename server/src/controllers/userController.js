import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { permanentlyDeleteUser as deleteUserAccount } from '../services/permanentlyDeleteUser.js';
import { recordActivity } from '../services/activityLog.js';

export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
  const filter = { role: { $in: ['admin', 'student'] } };
  if (req.query.role === 'admin' || req.query.role === 'student') filter.role = req.query.role;
  if (req.query.search) {
    const search = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: search }, { email: search }, { whatsapp: search }, { country: search }, { province: search }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: { users: users.map((user) => user.toSafeJSON()), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, whatsapp, country, province } = req.body;
  if (await User.findOne({ email })) throw ApiError.conflict('An account with this email already exists.');
  const user = new User({
    name,
    email,
    whatsapp: whatsapp || '',
    country: country || '',
    province: province || '',
    role: 'student',
    registrationStatus: 'approved',
    isActive: true,
  });
  await user.setPassword(password);
  try { await user.save(); }
  catch (error) { if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.'); throw error; }
  await recordActivity(req, { action: 'user.created', resourceType: 'user', resourceId: user._id, message: `Created student account ${user.name}.` });
  res.status(201).json({ success: true, data: { user: user.toSafeJSON() } });
});

export const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, isActive, password, whatsapp, country, province, registrationStatus } = req.body;
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found.');
  const isSelf = String(req.user._id) === String(user._id);
  if (isSelf && isActive === false) throw ApiError.badRequest('You cannot deactivate your own account.');
  if (isSelf && role && role !== user.role) throw ApiError.badRequest('You cannot change your own admin role.');

  if (name !== undefined) user.name = name;
  if (whatsapp !== undefined) user.whatsapp = whatsapp;
  if (country !== undefined) user.country = country;
  if (province !== undefined) user.province = province;
  if (email !== undefined && email !== user.email) {
    if (await User.exists({ email, _id: { $ne: user._id } })) throw ApiError.conflict('An account with this email already exists.');
    user.email = email;
  }
  if (role !== undefined && role !== user.role) {
    if (user.role === 'admin' && role !== 'admin' && (await User.countDocuments({ role: 'admin', isActive: true })) <= 1) {
      throw ApiError.conflict('The platform must keep at least one active administrator.');
    }
    user.role = role;
    user.tokenVersion += 1;
  }
  if (registrationStatus !== undefined) {
    if (user.role !== 'student') throw ApiError.badRequest('Only student registrations can be approved or rejected.');
    if (user.registrationStatus !== registrationStatus) user.tokenVersion += 1;
    user.registrationStatus = registrationStatus;
    if (registrationStatus === 'approved') user.isActive = true;
  }
  if (isActive !== undefined && user.isActive !== isActive) {
    if (isActive && user.registrationStatus !== 'approved') throw ApiError.badRequest('Approve this student registration before enabling the account.');
    user.isActive = isActive;
    user.tokenVersion += 1;
  }
  if (password) await user.setPassword(password);
  try { await user.save(); }
  catch (error) { if (error?.code === 11000) throw ApiError.conflict('An account with this email already exists.'); throw error; }
  await recordActivity(req, { action: 'user.updated', resourceType: 'user', resourceId: user._id, message: `Updated account ${user.name}.` });
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) throw ApiError.badRequest('You cannot permanently delete your own account.');
  const target = await User.findById(req.params.id).select('role');
  if (!target) throw ApiError.notFound('User not found.');
  if (target.role === 'admin') throw ApiError.forbidden('Administrator accounts cannot be permanently deleted here.');
  const user = await deleteUserAccount(req.params.id);
  await recordActivity(req, {
    action: 'user.permanently_deleted',
    resourceType: 'user',
    message: `Permanently deleted a ${user.role} account and its personal records.`,
  });
  res.json({ success: true, data: { user: { id: user._id.toString(), deleted: true } } });
});

export default { listUsers, createUser, updateUser, deleteUser };
