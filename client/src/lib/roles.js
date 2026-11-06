export const ROLES = Object.freeze({
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
});

export const normalizeRole = (role) => {
  if (role === 'owner') return ROLES.ADMIN;
  if (role === 'user') return ROLES.STUDENT;
  return Object.values(ROLES).includes(role) ? role : ROLES.STUDENT;
};

export const isAdminRole = (role) => normalizeRole(role) === ROLES.ADMIN;
export const isTeacherRole = (role) => normalizeRole(role) === ROLES.TEACHER;
export const isStudentRole = (role) => normalizeRole(role) === ROLES.STUDENT;

export const isAdmin = (user) => isAdminRole(user?.role);
export const isTeacher = (user) => isTeacherRole(user?.role);
export const isStudent = (user) => isStudentRole(user?.role);

export const roleLabel = (role) => ({
  [ROLES.ADMIN]: 'Admin',
  [ROLES.TEACHER]: 'Teacher',
  [ROLES.STUDENT]: 'Student',
})[normalizeRole(role)];
