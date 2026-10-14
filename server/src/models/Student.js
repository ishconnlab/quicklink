import mongoose from 'mongoose';
import { TRADE_KEYS } from './School.js';

export const STUDENT_STATUS = ['enrolled', 'graduated', 'transferred', 'dropped'];
export const SPONSORSHIP = ['government', 'private', 'sponsored', 'self', 'other'];
export const GENDERS = ['male', 'female', 'other'];

// Allows the value to be null (not captured) or one of the allowed values.
const enumOrNull = (values, label) => ({
  validator: (v) => v === null || v === undefined || values.includes(v),
  message: (props) => `${props.value} is not a valid ${label}`,
});

// Student records are aligned to Rwanda's NESA/RTB data model: enrolment,
// learner profile, TVET trade + level, sponsorship and a national
// exam/certification candidate index number.
const studentSchema = new mongoose.Schema(
  {
    // Every record belongs to exactly one account (multi-tenant isolation).
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
    schoolName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    holdingName: { type: String, default: '', trim: true },
    district: { type: String, default: '', trim: true, index: true },

    fullName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    fullNameKey: { type: String, required: true, index: true },

    // Official national exam / TVET candidate index number (NESA / RTB).
    indexNumber: { type: String, required: true, trim: true, maxlength: 60 },

    gender: { type: String, default: null, validate: enumOrNull(GENDERS, 'gender') },
    dateOfBirth: { type: Date, default: null },

    trade: { type: String, default: null, validate: enumOrNull(TRADE_KEYS, 'trade') },
    level: { type: String, default: '', trim: true, maxlength: 40 },

    sponsorship: {
      type: String,
      default: null,
      validate: enumOrNull(SPONSORSHIP, 'sponsorship'),
    },

    guardianName: { type: String, default: '', trim: true, maxlength: 160 },
    guardianPhone: { type: String, default: '', trim: true, maxlength: 40 },

    status: {
      type: String,
      enum: STUDENT_STATUS,
      default: 'enrolled',
      index: true,
    },
    enrolledAt: { type: Date, default: Date.now },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },

    // Client-generated id, reserved for idempotent offline synchronization.
    clientId: { type: String },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

studentSchema.index({ owner: 1, school: 1, status: 1 });
// The candidate index number is unique per account. Partial so records without
// one are never collated on null.
studentSchema.index(
  { owner: 1, indexNumber: 1 },
  { unique: true, partialFilterExpression: { indexNumber: { $type: 'string' } } }
);

studentSchema.pre('validate', function normalize(next) {
  this.fullNameKey = String(this.fullName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (typeof this.indexNumber === 'string') this.indexNumber = this.indexNumber.trim();
  next();
});

// Eligible to sit a national / TVET certification exam: enrolled, with a
// candidate index number, a trade and a level recorded.
studentSchema.methods.isCertificationReady = function isCertificationReady() {
  return (
    this.status === 'enrolled' &&
    Boolean(this.indexNumber) &&
    Boolean(this.trade) &&
    Boolean(this.level)
  );
};

studentSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    school: {
      id: this.school?._id?.toString?.() || this.school?.toString?.() || null,
      name: this.schoolName,
    },
    schoolName: this.schoolName,
    holdingName: this.holdingName,
    district: this.district,
    fullName: this.fullName,
    indexNumber: this.indexNumber,
    gender: this.gender ?? null,
    dateOfBirth: this.dateOfBirth,
    trade: this.trade ?? null,
    level: this.level || '',
    sponsorship: this.sponsorship ?? null,
    guardianName: this.guardianName,
    guardianPhone: this.guardianPhone,
    status: this.status,
    enrolledAt: this.enrolledAt,
    notes: this.notes,
    certificationReady: this.isCertificationReady(),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Student = mongoose.model('Student', studentSchema);
export default Student;
