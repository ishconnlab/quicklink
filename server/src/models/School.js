import mongoose from 'mongoose';

export const TRADE_KEYS = ['sod', 'nit', 'csa', 'acc', 'other'];
export const TRADE_LABELS = {
  sod: 'SOD',
  nit: 'NIT',
  csa: 'CSA',
  acc: 'ACC',
  other: 'Other',
};

// Sentinel for "explicitly no record / not applicable". Distinct from null,
// which means "unknown / not entered yet". Neither is counted as zero.
export const TRADE_NA = 'N/A';

const NA_PATTERN = /^(n\/?a|na|nil|none|unknown|not[\s-]?applicable|no[\s-]?record|-{1,2})$/i;

// Normalises a flexible count input (number, numeric string, "N/A", blank).
export function normalizeCount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (s === '') return null;
  if (NA_PATTERN.test(s)) return TRADE_NA;
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

export const isUnknownCount = (v) => v === null || v === undefined;
export const isKnownCount = (v) => typeof v === 'number' || v === TRADE_NA;

// A trade/count field accepts a non-negative integer, the literal "N/A",
// or null (blank). Values are normalised in pre('validate').
const countField = {
  type: mongoose.Schema.Types.Mixed,
  default: null,
  validate: {
    validator(v) {
      if (v === null || v === undefined) return true;
      if (typeof v === 'number') return Number.isInteger(v) && v >= 0;
      return v === TRADE_NA;
    },
    message: 'Value must be a non-negative whole number or "N/A"',
  },
};

const schoolSchema = new mongoose.Schema(
  {
    // Every record belongs to exactly one account (multi-tenant isolation).
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    holding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Holding',
      required: true,
      index: true,
    },
    holdingName: { type: String, required: true, trim: true },

    schoolName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    schoolNameKey: { type: String, required: true, index: true },

    district: { type: String, required: true, trim: true, maxlength: 120, index: true },

    dateOfCollection: { type: Date, required: true, index: true },

    trades: {
      sod: countField,
      nit: countField,
      csa: countField,
      acc: countField,
      other: countField,
    },

    totalStudents: { type: Number, default: 0, min: 0 },

    laptops: countField,
    teachers: countField,

    feedback: { type: String, trim: true, maxlength: 5000, default: '' },

    // Flags records that still contain unknown (null) values.
    isIncomplete: { type: Boolean, default: false, index: true },
    incompleteFields: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Client-generated id used for idempotent offline synchronization.
    // Left undefined (not null) so the sparse unique index ignores it.
    clientId: { type: String },

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Duplicates are detected in the controller (per owner + holding); the user
// may explicitly confirm a genuine same-name school under the same holding.
schoolSchema.index({ owner: 1, holding: 1, schoolNameKey: 1 });
// Idempotent offline sync is scoped per account. Must be a PARTIAL index:
// a compound sparse index indexes every doc (because owner always exists),
// which would make all clientId-less records collide on null.
schoolSchema.index(
  { owner: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

schoolSchema.pre('validate', function computeTotals(next) {
  if (this.isModified('schoolName') || !this.schoolNameKey) {
    this.schoolNameKey = String(this.schoolName || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  const known = [];
  const missing = [];
  for (const key of TRADE_KEYS) {
    const value = normalizeCount(this.trades?.[key]);
    if (this.trades) this.trades[key] = value;
    if (isUnknownCount(value)) missing.push(`trades.${key}`);
    else if (typeof value === 'number') known.push(value);
  }
  this.totalStudents = known.reduce((a, b) => a + b, 0);

  this.laptops = normalizeCount(this.laptops);
  if (isUnknownCount(this.laptops)) missing.push('laptops');

  this.teachers = normalizeCount(this.teachers);
  if (isUnknownCount(this.teachers)) missing.push('teachers');

  this.isIncomplete = missing.length > 0;
  this.incompleteFields = missing;
  next();
});

schoolSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    holding: {
      id: this.holding?._id?.toString?.() || this.holding?.toString?.() || null,
      name: this.holdingName,
    },
    schoolName: this.schoolName,
    district: this.district,
    dateOfCollection: this.dateOfCollection,
    trades: {
      sod: this.trades?.sod ?? null,
      nit: this.trades?.nit ?? null,
      csa: this.trades?.csa ?? null,
      acc: this.trades?.acc ?? null,
      other: this.trades?.other ?? null,
    },
    totalStudents: this.totalStudents,
    laptops: this.laptops ?? null,
    teachers: this.teachers ?? null,
    feedback: this.feedback || '',
    isIncomplete: this.isIncomplete,
    incompleteFields: this.incompleteFields || [],
    status: this.status,
    archivedAt: this.archivedAt,
    clientId: this.clientId,
    recordedBy: this.recordedBy?.toString?.() || null,
    recordedByName: this.recordedByName,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const School = mongoose.model('School', schoolSchema);
export default School;
