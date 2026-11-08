import ApiError from '../utils/ApiError.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  STUDENT: 'student',
});

export const PRIMARY_ROLES = Object.freeze(Object.values(ROLES));

// Legacy QuickLink databases used owner/admin and teacher roles. Only admin and
// student exist after the training-platform redesign: owner records become
// admins and former teacher records are safely demoted to students.
export function normalizeRole(role) {
  if (role === 'owner' || role === 'admin') return ROLES.ADMIN;
  return ROLES.STUDENT;
}

export function isAdmin(user) {
  const role = typeof user === 'string' ? user : user?.role;
  return role === ROLES.ADMIN || role === 'owner';
}

export function isTeacher() {
  return false;
}

export function isStudent(user) {
  return normalizeRole(typeof user === 'string' ? user : user?.role) === ROLES.STUDENT;
}

export function roleLabel(role) {
  return isAdmin(role) ? 'Admin' : 'Student';
}

export function classTeacherIds() {
  return [];
}

export function isClassTeacher() {
  return false;
}

export function isEnrolledStudent(user, learningClass) {
  if (!user || !learningClass) return false;
  return (learningClass.students || []).some(
    (student) => (student._id || student).toString() === user._id.toString(),
  );
}

export function canManageClass(user) {
  return isAdmin(user);
}

export function canAccessClass(user, learningClass) {
  return canManageClass(user) || isEnrolledStudent(user, learningClass);
}

export function assertCanManageClass(user, learningClass) {
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (!canManageClass(user)) {
    throw ApiError.forbidden('Only an administrator can manage training classes.');
  }
}

export function assertCanAccessClass(user, learningClass) {
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (!canAccessClass(user, learningClass)) {
    throw ApiError.forbidden('You do not have access to this class.');
  }
}

export default ROLES;
