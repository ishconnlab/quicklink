import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long'),
});

export const createUserSchema = registerSchema;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(['owner', 'user']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(200),
});

const NA_PATTERN = /^(n\/?a|na|nil|none|unknown|not[\s-]?applicable|no[\s-]?record|-{1,2})$/i;

// A flexible count: a non-negative integer, the literal "N/A", a known word
// for "no record", or blank (unknown -> null). Normalised to number | 'N/A' | null.
function normaliseCount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return null;
  if (NA_PATTERN.test(s)) return 'N/A';
  const n = Number(s);
  return Number.isNaN(n) ? Number.NaN : n;
}

const isCount = (v) => v === null || v === 'N/A' || (Number.isInteger(v) && v >= 0);

const countField = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform(normaliseCount)
  .refine(isCount, { message: 'Must be a non-negative whole number or "N/A"' });

// Update variant: absent fields stay undefined so partial updates are safe.
const countFieldOptional = z
  .union([z.number(), z.string(), z.null()])
  .transform(normaliseCount)
  .refine(isCount, { message: 'Must be a non-negative whole number or "N/A"' })
  .optional();

const tradesSchema = z.object({
  sod: countField,
  nit: countField,
  csa: countField,
  acc: countField,
  other: countField,
});

const tradesSchemaOptional = z.object({
  sod: countFieldOptional,
  nit: countFieldOptional,
  csa: countFieldOptional,
  acc: countFieldOptional,
  other: countFieldOptional,
});

export const createSchoolSchema = z.object({
  holding: z.string().trim().min(1, 'Holding / project is required'),
  schoolName: z.string().trim().min(2, 'School name is required').max(200),
  district: z.string().trim().min(1, 'District is required').max(120),
  dateOfCollection: z.coerce.date({
    errorMap: () => ({ message: 'A valid date of collection is required' }),
  }),
  trades: tradesSchema,
  laptops: countField,
  teachers: countField,
  feedback: z.string().max(5000).optional().default(''),
  clientId: z.string().trim().max(120).optional().nullable(),
  // When true, overrides a duplicate-school conflict on update.
  confirmDuplicate: z.boolean().optional().default(false),
});

export const updateSchoolSchema = createSchoolSchema
  .partial()
  .extend({
    trades: tradesSchemaOptional.optional(),
    schoolName: z.string().trim().min(2).max(200).optional(),
  });

export const archiveSchema = z.object({
  reason: z.string().max(500).optional().default(''),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

export function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
