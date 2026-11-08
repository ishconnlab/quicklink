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
  whatsapp: z.string().trim().min(7, 'Enter a valid WhatsApp number').max(40),
  country: z.string().trim().min(2, 'Choose your country').max(120),
  province: z.string().trim().min(2, 'Enter your province, state, or region').max(120),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  whatsapp: z.string().trim().max(40).optional().default(''),
  country: z.string().trim().max(120).optional().default(''),
  province: z.string().trim().max(120).optional().default(''),
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  role: z.enum(['admin', 'student']).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  country: z.string().trim().max(120).optional(),
  province: z.string().trim().max(120).optional(),
  registrationStatus: z.enum(['approved', 'rejected']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one account field to update');
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  country: z.string().trim().max(120).optional(),
  province: z.string().trim().max(120).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field to update');
export const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') });
