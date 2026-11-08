export const ROLES = Object.freeze({
  ADMIN: 'admin',
  STUDENT: 'student',
});

export const normalizeRole = (role) => {
  if (role === 'owner' || role === 'admin') return ROLES.ADMIN;
  return ROLES.STUDENT;
};

export const isAdminRole = (role) => normalizeRole(role) === ROLES.ADMIN;
export const isStudentRole = (role) => normalizeRole(role) === ROLES.STUDENT;
export const isAdmin = (user) => isAdminRole(user?.role);
export const isStudent = (user) => isStudentRole(user?.role);

export const roleLabel = (role) => (isAdminRole(role) ? 'Administrator' : 'Student');
