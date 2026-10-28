import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';
import asyncHandler from '../utils/asyncHandler.js';

// Core authentication: resolves the token into an active user.
async function authenticate(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized();
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired or invalid');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account is not active');
  }
  if ((payload.ver || 0) !== (user.tokenVersion || 0)) {
    throw ApiError.unauthorized('This session has been signed out. Please sign in again.');
  }
  // Invalidate tokens issued before the last password change.
  if (user.passwordChangedAt) {
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (issuedAt < user.passwordChangedAt.getTime() - 1000) {
      throw ApiError.unauthorized('Password was changed, please sign in again');
    }
  }

  if (user.role === 'user') {
    user.role = 'student';
    await user.save();
  }
  if (!['owner', 'teacher', 'student'].includes(user.role)) {
    throw ApiError.forbidden('This account does not have QuickLink Learning access');
  }

  req.user = user;
  return user;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  await authenticate(req);
  next();
});

// Only account owners may manage student accounts and the book catalog.
export const requireOwner = (req, _res, next) => {
  if (!req.user || req.user.role !== 'owner') {
    throw ApiError.forbidden('Only account owners can perform this action');
  }
  next();
};

export default requireAuth;
