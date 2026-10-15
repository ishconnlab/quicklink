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

export const registerParentSchema = z.object({
  token: z.string().trim().min(10, 'A valid invitation token is required').max(200),
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long'),
  relationship: z.string().trim().max(80).optional().default(''),
});

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

// --- Students -------------------------------------------------------------

const GENDER_VALUES = ['male', 'female', 'other'];
const TRADE_VALUES = ['sod', 'nit', 'csa', 'acc', 'other'];
const SPONSORSHIP_VALUES = ['government', 'private', 'sponsored', 'self', 'other'];
const STUDENT_STATUS_VALUES = ['enrolled', 'graduated', 'transferred', 'dropped'];

const nullify = (v) => (v === '' || v === undefined ? null : v);
const optionalEnumOrNull = (values) =>
  z.preprocess(nullify, z.enum(values).nullable()).optional();
const optionalDateOrNull = z.preprocess(nullify, z.union([z.coerce.date(), z.null()])).optional();

const optionalIndexNumber = z
  .preprocess(nullify, z.string().trim().min(1).max(60).nullable())
  .optional();

export const createStudentSchema = z.object({
  school: z.string().regex(/^[0-9a-fA-F]{24}$/, 'A valid school is required'),
  fullName: z.string().trim().min(2, 'Full name is required').max(200),
  indexNumber: optionalIndexNumber,
  gender: optionalEnumOrNull(GENDER_VALUES),
  dateOfBirth: optionalDateOrNull,
  trade: optionalEnumOrNull(TRADE_VALUES),
  level: z.string().trim().max(40).optional().default(''),
  sponsorship: optionalEnumOrNull(SPONSORSHIP_VALUES),
  guardianName: z.string().trim().max(160).optional().default(''),
  guardianPhone: z.string().trim().max(40).optional().default(''),
  status: z.enum(STUDENT_STATUS_VALUES).optional().default('enrolled'),
  enrolledAt: optionalDateOrNull,
  notes: z.string().trim().max(2000).optional().default(''),
  clientId: z.string().trim().max(120).optional().nullable(),
});

export const updateStudentSchema = z.object({
  school: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid school').optional(),
  fullName: z.string().trim().min(2, 'Full name is required').max(200).optional(),
  indexNumber: optionalIndexNumber,
  gender: optionalEnumOrNull(GENDER_VALUES),
  dateOfBirth: optionalDateOrNull,
  trade: optionalEnumOrNull(TRADE_VALUES),
  level: z.string().trim().max(40).optional(),
  sponsorship: optionalEnumOrNull(SPONSORSHIP_VALUES),
  guardianName: z.string().trim().max(160).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  status: z.enum(STUDENT_STATUS_VALUES).optional(),
  enrolledAt: optionalDateOrNull,
  notes: z.string().trim().max(2000).optional(),
  clientId: z.string().trim().max(120).optional().nullable(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

export const studentIdParamSchema = z.object({
  studentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

export const documentParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
  docId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid document id'),
});

// --- Admission packs ------------------------------------------------------

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const objectIdOrNull = z.preprocess(nullify, objectId.nullable()).optional();

const REQUIREMENT_TYPE_VALUES = [
  'must_bring',
  'school_provides',
  'optional',
  'required_document',
  'payment',
  'requires_verification',
];
const REQUIREMENT_CATEGORY_VALUES = [
  'student',
  'document',
  'uniform',
  'stationery',
  'tools',
  'hygiene',
  'boarding',
  'payment',
  'other',
];
const APPLICATION_STATUS_VALUES = [
  'draft',
  'submitted',
  'under_review',
  'incomplete',
  'accepted',
  'rejected',
  'enrolled',
];
const PARENT_STATUS_VALUES = ['pending', 'preparing', 'ready', 'unavailable', 'submitted'];

const stringList = z.array(z.string().trim().max(80)).max(50).optional();

const appliesToSchema = z
  .object({
    levels: stringList,
    trades: stringList,
    studentCategories: stringList,
  })
  .optional();

const requirementInputSchema = z.object({
  key: z.string().trim().max(80).optional(),
  type: z.enum(REQUIREMENT_TYPE_VALUES).optional().default('must_bring'),
  category: z.enum(REQUIREMENT_CATEGORY_VALUES).optional().default('other'),
  title: z.string().trim().min(1, 'A title is required').max(200),
  description: z.string().trim().max(2000).optional().default(''),
  quantity: z.string().trim().max(40).optional().default(''),
  unit: z.string().trim().max(40).optional().default(''),
  appliesTo: appliesToSchema,
  deadline: optionalDateOrNull,
  sortOrder: z.number().optional(),
  status: z.enum(['active', 'archived']).optional().default('active'),
});

const datedLabelSchema = z.object({
  label: z.string().trim().min(1).max(120),
  date: optionalDateOrNull,
  note: z.string().trim().max(300).optional().default(''),
});

const contactSchema = z.object({
  name: z.string().trim().max(160).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
});

const paymentInfoSchema = z.object({
  required: z.boolean().optional().default(false),
  channels: stringList,
  instructions: z.string().trim().max(2000).optional().default(''),
  reference: z.string().trim().max(120).optional().default(''),
});

export const createAdmissionPackSchema = z.object({
  school: objectId,
  academicYear: z.string().trim().min(1, 'Academic year is required').max(20),
  title: z.string().trim().max(200).optional().default(''),
  admissionPeriod: z
    .object({ opensAt: optionalDateOrNull, closesAt: optionalDateOrNull })
    .optional(),
  levels: stringList,
  trades: stringList,
  studentCategories: stringList,
  requirements: z.array(requirementInputSchema).max(200).optional().default([]),
  reportingDates: z.array(datedLabelSchema).max(50).optional().default([]),
  deadlines: z.array(datedLabelSchema).max(50).optional().default([]),
  instructions: z.string().trim().max(5000).optional().default(''),
  contact: contactSchema.optional(),
  paymentInfo: paymentInfoSchema.optional(),
  attachments: z
    .array(
      z.object({
        title: z.string().trim().max(200).optional().default(''),
        url: z.string().trim().max(500).optional().default(''),
        type: z.string().trim().max(40).optional().default(''),
      })
    )
    .max(30)
    .optional()
    .default([]),
});

export const updateAdmissionPackSchema = createAdmissionPackSchema.partial();

export const admissionPackActionSchema = z.object({
  note: z.string().trim().max(500).optional().default(''),
});

// --- Admission applications ----------------------------------------------

const guardianContactSchema = z.object({
  name: z.string().trim().max(160).optional().default(''),
  relationship: z.string().trim().max(80).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  nationalId: z.string().trim().max(60).optional().default(''),
});

const applicationDocumentSchema = z.object({
  key: z.string().trim().max(80).optional().default(''),
  title: z.string().trim().max(200).optional().default(''),
  fileName: z.string().trim().max(300).optional().default(''),
  url: z.string().trim().max(500).optional().default(''),
  status: z.enum(['pending', 'verified', 'rejected', 'missing']).optional().default('pending'),
  note: z.string().trim().max(500).optional().default(''),
});

export const createApplicationSchema = z.object({
  school: objectId,
  admissionPack: objectIdOrNull,
  academicYear: z.string().trim().min(1, 'Academic year is required').max(20),
  level: z.string().trim().max(40).optional().default(''),
  trade: z.string().trim().max(40).optional().default(''),
  studentCategory: z.string().trim().max(60).optional().default(''),
  firstName: z.string().trim().max(120).optional().default(''),
  lastName: z.string().trim().max(120).optional().default(''),
  fullName: z.string().trim().min(2, 'Learner name is required').max(200),
  gender: optionalEnumOrNull(GENDER_VALUES),
  dateOfBirth: optionalDateOrNull,
  previousSchool: z.string().trim().max(200).optional().default(''),
  sponsorship: z.string().trim().max(60).optional().default(''),
  guardian: guardianContactSchema.optional(),
  guardian2: guardianContactSchema.optional(),
  documents: z.array(applicationDocumentSchema).max(50).optional(),
  submit: z.boolean().optional().default(false),
  confirmDuplicate: z.boolean().optional().default(false),
  clientId: z.string().trim().max(120).optional().nullable(),
});

export const updateApplicationSchema = createApplicationSchema
  .partial()
  .extend({ school: objectId.optional() });

export const reviewApplicationSchema = z.object({
  status: z.enum(['under_review', 'incomplete', 'rejected']),
  note: z.string().trim().max(2000).optional().default(''),
});

export const acceptApplicationSchema = z.object({
  note: z.string().trim().max(2000).optional().default(''),
});

export const enrollApplicationSchema = z.object({
  studentId: objectIdOrNull,
  indexNumber: optionalIndexNumber,
  level: z.string().trim().max(40).optional(),
  trade: optionalEnumOrNull(TRADE_VALUES),
  sponsorship: optionalEnumOrNull(SPONSORSHIP_VALUES),
  guardianPhone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(2000).optional().default(''),
});

export const addApplicationNoteSchema = z.object({
  note: z.string().trim().min(1, 'A note is required').max(2000),
});

export const verifyDocumentSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'missing']),
  note: z.string().trim().max(500).optional().default(''),
});

// --- Requirement checklist -------------------------------------------------

export const updateRequirementSchema = z.object({
  parentStatus: z.enum(PARENT_STATUS_VALUES).optional(),
  parentNote: z.string().trim().max(1000).optional(),
  schoolVerified: z.boolean().optional(),
  schoolNote: z.string().trim().max(1000).optional(),
  assistance: z
    .object({
      needed: z.boolean().optional().default(false),
      note: z.string().trim().max(1000).optional().default(''),
    })
    .optional(),
});

// --- Guardians -------------------------------------------------------------

export const inviteGuardianSchema = z.object({
  student: objectId,
  name: z.string().trim().max(160).optional().default(''),
  relationship: z.string().trim().max(80).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  permissions: z
    .object({
      viewRecords: z.boolean().optional(),
      viewChecklist: z.boolean().optional(),
      message: z.boolean().optional(),
      viewDocuments: z.boolean().optional(),
    })
    .optional(),
  expiresInDays: z.number().int().min(1).max(60).optional().default(14),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(10, 'A valid invitation token is required').max(200),
});

export const linkActionSchema = z.object({
  note: z.string().trim().max(1000).optional().default(''),
});

// --- Messaging -------------------------------------------------------------

export const ensureConversationSchema = z.object({
  student: objectId,
  subject: z.string().trim().max(200).optional().default(''),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'A message is required').max(4000),
});

export const parentRequirementSchema = z.object({
  parentStatus: z.enum(PARENT_STATUS_VALUES).optional(),
  parentNote: z.string().trim().max(1000).optional(),
});

export function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
