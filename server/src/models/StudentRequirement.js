import mongoose from 'mongoose';

// Parent-facing readiness states. A parent can mark an item as being prepared,
// ready, unavailable or submitted. Only school staff can verify an item.
export const PARENT_STATUS = ['pending', 'preparing', 'ready', 'unavailable', 'submitted'];

const evidenceSchema = new mongoose.Schema(
  {
    fileName: { type: String, default: '', trim: true, maxlength: 300 },
    url: { type: String, default: '', trim: true, maxlength: 500 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// One checklist item for one enrolled student, generated from the pack version
// snapshot captured when the admission application was accepted.
const studentRequirementSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdmissionApplication',
      default: null,
      index: true,
    },
    admissionPack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdmissionPack',
      default: null,
    },
    packVersion: { type: Number, default: null },
    academicYear: { type: String, default: '', trim: true },

    key: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, default: 'must_bring', trim: true, maxlength: 40 },
    category: { type: String, default: 'other', trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    quantity: { type: String, default: '', trim: true, maxlength: 40 },
    unit: { type: String, default: '', trim: true, maxlength: 40 },
    deadline: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },

    // Whether school staff must explicitly verify this item (documents and
    // requires_verification requirements).
    requiresVerification: { type: Boolean, default: false },

    parentStatus: { type: String, enum: PARENT_STATUS, default: 'pending', index: true },
    parentNote: { type: String, default: '', trim: true, maxlength: 1000 },
    parentUpdatedAt: { type: Date, default: null },

    schoolVerified: { type: Boolean, default: false },
    schoolNote: { type: String, default: '', trim: true, maxlength: 1000 },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },

    // Staff-recorded exception/assistance (e.g. school waives or supplies an item).
    assistance: {
      needed: { type: Boolean, default: false },
      note: { type: String, default: '', trim: true, maxlength: 1000 },
    },

    evidence: { type: [evidenceSchema], default: [] },
  },
  { timestamps: true }
);

studentRequirementSchema.index({ owner: 1, student: 1 });
studentRequirementSchema.index({ owner: 1, application: 1 });

studentRequirementSchema.methods.isComplete = function isComplete() {
  if (this.requiresVerification) {
    return this.schoolVerified === true;
  }
  return ['ready', 'submitted', 'unavailable'].includes(this.parentStatus);
};

studentRequirementSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    student: this.student?.toString?.() || null,
    application: this.application?.toString?.() || null,
    admissionPack: this.admissionPack?.toString?.() || null,
    packVersion: this.packVersion,
    academicYear: this.academicYear,
    key: this.key,
    type: this.type,
    category: this.category,
    title: this.title,
    description: this.description,
    quantity: this.quantity,
    unit: this.unit,
    deadline: this.deadline,
    sortOrder: this.sortOrder,
    requiresVerification: this.requiresVerification,
    parentStatus: this.parentStatus,
    parentNote: this.parentNote,
    parentUpdatedAt: this.parentUpdatedAt,
    schoolVerified: this.schoolVerified,
    schoolNote: this.schoolNote,
    verifiedAt: this.verifiedAt,
    assistance: this.assistance,
    evidence: this.evidence.map((e) => ({
      id: e._id?.toString?.() || null,
      fileName: e.fileName,
      url: e.url,
      uploadedAt: e.uploadedAt,
    })),
    complete: this.isComplete(),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const StudentRequirement = mongoose.model(
  'StudentRequirement',
  studentRequirementSchema
);
export default StudentRequirement;
