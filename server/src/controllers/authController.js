import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';
import { normalizeRole } from '../security/roles.js';
import config from '../config/env.js';
import { deleteCloudinaryAsset, uploadCloudinaryBuffer } from '../services/cloudinary.js';

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
  for (const field of [
    'name', 'whatsapp', 'country', 'province', 'location', 'institution',
    'educationLevel', 'biography', 'skills', 'githubUrl', 'linkedinUrl',
    'portfolioUrl', 'socialUrl',
  ]) {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  }
  await user.save();
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const updateProfileImage = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP image.');
  const buffer = req.file.buffer;
  const isPng = buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) throw ApiError.badRequest('Profile image must be a PNG, JPEG, or WebP file.');
  if (!config.cloudinary.enabled) throw ApiError.conflict('Cloudinary is not configured. Contact the administrator.');

  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.unauthorized();
  const previousPublicId = user.profileImagePublicId;
  const uploaded = await uploadCloudinaryBuffer({
    buffer,
    folder: null,
    resourceType: 'image',
  });
  if (!uploaded?.secureUrl) throw ApiError.conflict('The profile image could not be uploaded.');
  user.profileImageUrl = uploaded.secureUrl;
  user.profileImagePublicId = uploaded.publicId;
  await user.save();
  if (previousPublicId) {
    await deleteCloudinaryAsset({ publicId: previousPublicId, resourceType: 'image' }).catch(() => {});
  }
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

export default { login, register, me, updateProfile, updateProfileImage, changePassword, logout };
