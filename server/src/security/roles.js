import ApiError from '../utils/ApiError.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
});

export const PRIMARY_ROLES = Object.freeze(Object.values(ROLES));

// Historical QuickLink databases used "owner" for the administrator role.
// Treat it as an alias so existing sessions and records keep working until the
// migration script has normalized the stored value.
export function normalizeRole(role) {
  if (role === 'owner' || role === 'admin') return ROLES.ADMIN;
  if (role === 'teacher') return ROLES.TEACHER;
  return ROLES.STUDENT;
}

export function isAdmin(user) {
  const role = typeof user === 'string' ? user : user?.role;
  return role === ROLES.ADMIN || role === 'owner';
}

export function isTeacher(user) {
  return (typeof user === 'string' ? user : user?.role) === ROLES.TEACHER;
}

export function isStudent(user) {
  return (typeof user === 'string' ? user : user?.role) === ROLES.STUDENT;
}

export function roleLabel(role) {
  if (isAdmin(role)) return 'Admin';
  if (isTeacher(role)) return 'Teacher';
  return 'Student';
}

export function classTeacherIds(learningClass) {
  if (!learningClass) return [];
  return [learningClass.teacher, ...(learningClass.teachers || [])]
    .filter(Boolean)
    .map((teacher) => (teacher._id || teacher).toString());
}

export function isClassTeacher(user, learningClass) {
  if (!user || !learningClass) return false;
  return classTeacherIds(learningClass).includes(user._id.toString());
}

export function isEnrolledStudent(user, learningClass) {
  if (!user || !learningClass) return false;
  return (learningClass.students || []).some(
    (student) => (student._id || student).toString() === user._id.toString(),
  );
}

export function canManageClass(user, learningClass) {
  return isAdmin(user) || isClassTeacher(user, learningClass);
}

export function canAccessClass(user, learningClass) {
  return canManageClass(user, learningClass) || isEnrolledStudent(user, learningClass);
}

export function assertCanManageClass(user, learningClass) {
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (!canManageClass(user, learningClass)) {
    throw ApiError.forbidden('Only an assigned teacher or an administrator can manage this class.');
  }
}

export function assertCanAccessClass(user, learningClass) {
  if (!learningClass) throw ApiError.notFound('Class not found');
  if (!canAccessClass(user, learningClass)) {
    throw ApiError.forbidden('You do not have access to this class.');
  }
}

export default ROLES;
