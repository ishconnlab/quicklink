import mongoose from 'mongoose';

export const TRADE_KEYS = ['sod', 'nit', 'csa', 'acc', 'other'];
export const TRADE_LABELS = {
  sod: 'SOD',
  nit: 'NIT',
  csa: 'CSA',
  acc: 'ACC',
  other: 'Other',
};

// A trade count may be a non-negative integer or null (unknown).
const tradeField = {
  type: Number,
  default: null,
  min: [0, 'Trade count cannot be negative'],
  validate: {
    validator(v) {
      return v === null || v === undefined || (Number.isInteger(v) && v >= 0);
    },
    message: 'Trade count must be a non-negative integer',
  },
};

const schoolSchema = new mongoose.Schema(
  {
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
      sod: tradeField,
      nit: tradeField,
      csa: tradeField,
      acc: tradeField,
      other: tradeField,
    },

    totalStudents: { type: Number, default: 0, min: 0 },

    laptops: {
      type: Number,
      default: null,
      min: [0, 'Laptops cannot be negative'],
      validate: {
        validator(v) {
          return v === null || v === undefined || (Number.isInteger(v) && v >= 0);
        },
        message: 'Laptops must be a non-negative integer',
      },
    },
    teachers: {
      type: Number,
      default: null,
      min: [0, 'Teachers cannot be negative'],
      validate: {
        validator(v) {
          return v === null || v === undefined || (Number.isInteger(v) && v >= 0);
        },
        message: 'Teachers must be a non-negative integer',
      },
    },

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

// Not unique: duplicates are detected in the controller and the user may
// explicitly confirm a genuine same-name school under the same holding.
schoolSchema.index({ holding: 1, schoolNameKey: 1 });
schoolSchema.index({ clientId: 1 }, { unique: true, sparse: true });

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
    const val = this.trades?.[key];
    if (val === null || val === undefined) {
      missing.push(`trades.${key}`);
    } else {
      known.push(val);
    }
  }
  this.totalStudents = known.reduce((a, b) => a + b, 0);

  if (this.laptops === null || this.laptops === undefined) missing.push('laptops');
  if (this.teachers === null || this.teachers === undefined) missing.push('teachers');

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
