import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import ApiError from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  ROLES,
  assertCanManageClass,
  canAccessClass,
  isAdmin,
  isClassTeacher,
  isEnrolledStudent,
  normalizeRole,
} from '../security/roles.js';

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
    user.role = ROLES.STUDENT;
    await user.save();
  }
  const role = normalizeRole(user.role);
  if (!Object.values(ROLES).includes(role)) {
    throw ApiError.forbidden('This account does not have QuickLink Learning access');
  }
  // Legacy records remain valid without waiting for the data migration.
  user.role = role;

  req.user = user;
  return user;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  await authenticate(req);
  next();
});

export function requireRole(...roles) {
  const allowed = new Set(roles.map(normalizeRole));
  return (req, _res, next) => {
    if (!req.user || !allowed.has(normalizeRole(req.user.role))) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  };
}

export const requireAdmin = requireRole(ROLES.ADMIN);

// Administrators can service any teacher workflow. Controllers still enforce
// class ownership before mutating a specific class.
export const requireTeacher = requireRole(ROLES.TEACHER, ROLES.ADMIN);

export const requireStudent = requireRole(ROLES.STUDENT);

// Backwards-compatible alias for route files and external integrations that
// still reference the historical owner role.
export const requireOwner = requireAdmin;

async function loadClass(classId) {
  if (!classId) throw ApiError.badRequest('Class identifier is missing');
  const learningClass = await LearningClass.findById(classId)
    .select('teacher teachers students active title createdBy');
  if (!learningClass) throw ApiError.notFound('Class not found');
  return learningClass;
}

export function requireClassOwnerOrAdmin(param = 'classId') {
  return asyncHandler(async (req, _res, next) => {
    const learningClass = await loadClass(req.params[param] || req.params.id || req.body?.classId || req.body?.learningClass);
    assertCanManageClass(req.user, learningClass);
    req.learningClass = learningClass;
    next();
  });
}

export function requireEnrolledStudent(param = 'classId') {
  return asyncHandler(async (req, _res, next) => {
    const learningClass = await loadClass(req.params[param] || req.params.id || req.body?.classId || req.body?.learningClass);
    const enrolled = isEnrolledStudent(req.user, learningClass);
    if (!enrolled && !isClassTeacher(req.user, learningClass) && !isAdmin(req.user)) {
      throw ApiError.forbidden('You are not enrolled in this class.');
    }
    if (!canAccessClass(req.user, learningClass)) {
      throw ApiError.forbidden('You do not have access to this class.');
    }
    req.learningClass = learningClass;
    next();
  });
}

export default requireAuth;
