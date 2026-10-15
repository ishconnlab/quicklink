import mongoose from 'mongoose';

// Requirement types and categories (see the admission-pack specification).
export const REQUIREMENT_TYPES = [
  'must_bring',
  'school_provides',
  'optional',
  'required_document',
  'payment',
  'requires_verification',
];

export const REQUIREMENT_CATEGORIES = [
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

export const PACK_STATUS = ['draft', 'published', 'archived'];

// A single admission requirement. `appliesTo` narrows a requirement to specific
// levels / trades / student categories; empty arrays mean "applies to all".
const requirementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: REQUIREMENT_TYPES, default: 'must_bring' },
    category: { type: String, enum: REQUIREMENT_CATEGORIES, default: 'other' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    quantity: { type: String, default: '', trim: true, maxlength: 40 },
    unit: { type: String, default: '', trim: true, maxlength: 40 },
    appliesTo: {
      levels: { type: [String], default: [] },
      trades: { type: [String], default: [] },
      studentCategories: { type: [String], default: [] },
    },
    deadline: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { _id: true }
);

const reportingDateSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: Date, default: null },
    note: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { _id: false }
);

// Immutable snapshot captured at publish time. Applications reference the
// snapshot so later pack edits never rewrite historical records.
const versionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    publishedAt: { type: Date, default: Date.now },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false }
);

const admissionPackSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    schoolName: { type: String, default: '', trim: true },
    academicYear: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, default: '', trim: true, maxlength: 200 },

    admissionPeriod: {
      opensAt: { type: Date, default: null },
      closesAt: { type: Date, default: null },
    },

    levels: { type: [String], default: [] },
    trades: { type: [String], default: [] },
    studentCategories: { type: [String], default: [] },

    requirements: { type: [requirementSchema], default: [] },

    reportingDates: { type: [reportingDateSchema], default: [] },
    deadlines: { type: [reportingDateSchema], default: [] },

    instructions: { type: String, default: '', trim: true, maxlength: 5000 },
    contact: {
      name: { type: String, default: '', trim: true, maxlength: 160 },
      phone: { type: String, default: '', trim: true, maxlength: 40 },
      email: { type: String, default: '', trim: true, maxlength: 160 },
    },

    // Payment details are always school-configured; never hardcoded.
    paymentInfo: {
      required: { type: Boolean, default: false },
      channels: { type: [String], default: [] },
      instructions: { type: String, default: '', trim: true, maxlength: 2000 },
      reference: { type: String, default: '', trim: true, maxlength: 120 },
    },

    attachments: {
      type: [
        {
          title: { type: String, default: '', trim: true, maxlength: 200 },
          url: { type: String, default: '', trim: true, maxlength: 500 },
          type: { type: String, default: '', trim: true, maxlength: 40 },
        },
      ],
      default: [],
    },

    status: { type: String, enum: PACK_STATUS, default: 'draft', index: true },
    version: { type: Number, default: 0 },
    previousVersionOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdmissionPack',
      default: null,
    },
    versions: { type: [versionSchema], default: [] },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

admissionPackSchema.index({ owner: 1, school: 1, academicYear: 1, status: 1 });

// True when the requirement applies to the given learner attributes.
admissionPackSchema.statics.requirementApplies = function requirementApplies(requirement, target) {
  const rule = requirement.appliesTo || {};
  const matches = (list, value) => !list || list.length === 0 || (value && list.includes(value));
  return (
    matches(rule.levels, target.level) &&
    matches(rule.trades, target.trade) &&
    matches(rule.studentCategories, target.studentCategory)
  );
};

// The immutable snapshot used to generate checklists for applications accepted
// against this published version.
admissionPackSchema.methods.versionSnapshot = function versionSnapshot(versionNumber) {
  const entry = this.versions.find((v) => v.version === versionNumber);
  return entry ? entry.snapshot : null;
};

admissionPackSchema.methods.buildSnapshot = function buildSnapshot() {
  return {
    packId: this._id.toString(),
    school: this.school?.toString?.() || null,
    academicYear: this.academicYear,
    title: this.title || '',
    levels: this.levels,
    trades: this.trades,
    studentCategories: this.studentCategories,
    requirements: (this.requirements || []).map((r) => ({
      key: r.key,
      type: r.type,
      category: r.category,
      title: r.title,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      appliesTo: {
        levels: r.appliesTo?.levels || [],
        trades: r.appliesTo?.trades || [],
        studentCategories: r.appliesTo?.studentCategories || [],
      },
      deadline: r.deadline,
      sortOrder: r.sortOrder,
      status: r.status,
    })),
    reportingDates: this.reportingDates,
    deadlines: this.deadlines,
    instructions: this.instructions,
    contact: this.contact,
    paymentInfo: this.paymentInfo,
    attachments: this.attachments,
  };
};

admissionPackSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    school: {
      id: this.school?._id?.toString?.() || this.school?.toString?.() || null,
      name: this.schoolName,
    },
    academicYear: this.academicYear,
    title: this.title,
    admissionPeriod: this.admissionPeriod,
    levels: this.levels,
    trades: this.trades,
    studentCategories: this.studentCategories,
    requirements: this.requirements.map((r) => ({
      id: r._id?.toString?.() || null,
      key: r.key,
      type: r.type,
      category: r.category,
      title: r.title,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      appliesTo: r.appliesTo,
      deadline: r.deadline,
      sortOrder: r.sortOrder,
      status: r.status,
    })),
    reportingDates: this.reportingDates,
    deadlines: this.deadlines,
    instructions: this.instructions,
    contact: this.contact,
    paymentInfo: this.paymentInfo,
    attachments: this.attachments,
    status: this.status,
    version: this.version,
    versionCount: this.versions.length,
    previousVersionOf: this.previousVersionOf?.toString?.() || null,
    publishedAt: this.publishedAt,
    archivedAt: this.archivedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const AdmissionPack = mongoose.model('AdmissionPack', admissionPackSchema);
export default AdmissionPack;
