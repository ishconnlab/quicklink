import { z } from 'zod';

export const formatZodError = (error) => error.issues.map((issue) => ({
  path: issue.path.join('.'),
  message: issue.message,
}));

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(254),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  educationLevel: z.enum(['L3', 'L4', 'L5']),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['teacher', 'student']).default('student'),
  educationLevel: z.enum(['L3', 'L4', 'L5']).optional(),
}).refine((body) => body.role !== 'student' || Boolean(body.educationLevel), 'Choose an education level for student accounts.');
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  role: z.enum(['teacher', 'student']).optional(),
  educationLevel: z.enum(['L3', 'L4', 'L5']).nullable().optional(),
  registrationStatus: z.enum(['approved', 'rejected']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one account field to update')
  .refine((value) => value.role !== 'student' || Boolean(value.educationLevel), 'Choose an education level when assigning the student role.');
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});
export const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') });
