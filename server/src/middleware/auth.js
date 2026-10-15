import { User } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';
import asyncHandler from '../utils/asyncHandler.js';

// Core authentication: resolves the token into an active user. Throws on any
// failure so callers can compose it (e.g. requireStaff).
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

  // Invalidate tokens issued before the last password change.
  if (user.passwordChangedAt) {
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (issuedAt < user.passwordChangedAt.getTime() - 1000) {
      throw ApiError.unauthorized('Password was changed, please sign in again');
    }
  }

  req.user = user;
  return user;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  await authenticate(req);
  next();
});

// Only account owners may manage other accounts / approvals.
export const requireOwner = (req, _res, next) => {
  if (!req.user || req.user.role !== 'owner') {
    throw ApiError.forbidden('Only account owners can perform this action');
  }
  next();
};

// Authenticates and rejects parent accounts. School administration data is only
// available to staff (owners and users); parents reach their own data through
// the dedicated /parent routes.
export const requireStaff = asyncHandler(async (req, _res, next) => {
  await authenticate(req);
  if (req.user.role === 'parent') {
    throw ApiError.forbidden('Parent accounts cannot access school data');
  }
  next();
});

export default requireAuth;
