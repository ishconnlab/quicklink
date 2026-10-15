import mongoose from 'mongoose';

export const APPLICATION_STATUS = [
  'draft',
  'submitted',
  'under_review',
  'incomplete',
  'accepted',
  'rejected',
  'enrolled',
];

export const DOCUMENT_STATUS = ['pending', 'verified', 'rejected', 'missing'];

const documentSchema = new mongoose.Schema(
  {
    key: { type: String, default: '', trim: true, maxlength: 80 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    fileName: { type: String, default: '', trim: true, maxlength: 300 },
    url: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: DOCUMENT_STATUS, default: 'pending' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true, maxlength: 2000 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 60 },
    from: { type: String, default: '', trim: true, maxlength: 40 },
    to: { type: String, default: '', trim: true, maxlength: 40 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: true }
);

const guardianContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true, maxlength: 160 },
    relationship: { type: String, default: '', trim: true, maxlength: 80 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    nationalId: { type: String, default: '', trim: true, maxlength: 60 },
  },
  { _id: false }
);

const admissionApplicationSchema = new mongoose.Schema(
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

    admissionPack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdmissionPack',
      default: null,
      index: true,
    },
    // Published pack version the application was submitted against. The pack
    // snapshot below is frozen so historical records are never rewritten.
    packVersion: { type: Number, default: null },
    packSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    academicYear: { type: String, required: true, trim: true, maxlength: 20 },

    reference: { type: String, required: true, trim: true, maxlength: 40 },

    level: { type: String, default: '', trim: true, maxlength: 40 },
    trade: { type: String, default: '', trim: true, maxlength: 40 },
    studentCategory: { type: String, default: '', trim: true, maxlength: 60 },

    firstName: { type: String, default: '', trim: true, maxlength: 120 },
    lastName: { type: String, default: '', trim: true, maxlength: 120 },
    fullName: { type: String, required: true, trim: true, maxlength: 200 },
    fullNameKey: { type: String, required: true, index: true },

    gender: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    previousSchool: { type: String, default: '', trim: true, maxlength: 200 },
    sponsorship: { type: String, default: '', trim: true, maxlength: 60 },

    guardian: { type: guardianContactSchema, default: () => ({}) },
    guardian2: { type: guardianContactSchema, default: () => ({}) },

    documents: { type: [documentSchema], default: [] },
    reviewerNotes: { type: [noteSchema], default: [] },
    history: { type: [historySchema], default: [] },

    status: { type: String, enum: APPLICATION_STATUS, default: 'draft', index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdmissionApplication',
      default: null,
    },

    submittedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: String },
  },
  { timestamps: true }
);

admissionApplicationSchema.index({ owner: 1, reference: 1 }, { unique: true });
admissionApplicationSchema.index({ owner: 1, school: 1, academicYear: 1, status: 1 });
// Used for duplicate-application detection (school + year + learner identity).
admissionApplicationSchema.index({ owner: 1, school: 1, academicYear: 1, fullNameKey: 1 });

admissionApplicationSchema.pre('validate', function normalize(next) {
  this.fullNameKey = String(this.fullName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!this.fullName && (this.firstName || this.lastName)) {
    this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    this.fullNameKey = this.fullName.toLowerCase().replace(/\s+/g, ' ');
  }
  next();
});

admissionApplicationSchema.methods.recordHistory = function recordHistory(action, extra = {}) {
  this.history.push({
    action,
    from: extra.from || '',
    to: extra.to || '',
    by: extra.by || null,
    note: extra.note || '',
    at: new Date(),
  });
};

admissionApplicationSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    school: {
      id: this.school?._id?.toString?.() || this.school?.toString?.() || null,
      name: this.schoolName,
    },
    schoolName: this.schoolName,
    admissionPack: this.admissionPack?.toString?.() || null,
    packVersion: this.packVersion,
    academicYear: this.academicYear,
    reference: this.reference,
    level: this.level,
    trade: this.trade,
    studentCategory: this.studentCategory,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    gender: this.gender ?? null,
    dateOfBirth: this.dateOfBirth,
    previousSchool: this.previousSchool,
    sponsorship: this.sponsorship,
    guardian: this.guardian,
    guardian2: this.guardian2,
    documents: this.documents.map((d) => ({
      id: d._id?.toString?.() || null,
      key: d.key,
      title: d.title,
      fileName: d.fileName,
      url: d.url,
      status: d.status,
      verifiedAt: d.verifiedAt,
      note: d.note,
    })),
    reviewerNotes: this.reviewerNotes.map((n) => ({
      id: n._id?.toString?.() || null,
      note: n.note,
      at: n.at,
    })),
    history: this.history.map((h) => ({
      id: h._id?.toString?.() || null,
      action: h.action,
      from: h.from,
      to: h.to,
      at: h.at,
      note: h.note,
    })),
    status: this.status,
    student: this.student?.toString?.() || null,
    duplicateOf: this.duplicateOf?.toString?.() || null,
    submittedAt: this.submittedAt,
    reviewedAt: this.reviewedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const AdmissionApplication = mongoose.model(
  'AdmissionApplication',
  admissionApplicationSchema
);
export default AdmissionApplication;
