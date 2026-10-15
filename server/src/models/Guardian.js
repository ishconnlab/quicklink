import mongoose from 'mongoose';
import crypto from 'crypto';

export const INVITATION_STATUS = ['pending', 'accepted', 'expired', 'revoked'];
export const LINK_STATUS = ['pending', 'approved', 'revoked'];

const permissionsSchema = new mongoose.Schema(
  {
    viewRecords: { type: Boolean, default: true },
    viewChecklist: { type: Boolean, default: true },
    message: { type: Boolean, default: true },
    viewDocuments: { type: Boolean, default: false },
  },
  { _id: false }
);

// A school-issued invitation to a guardian contact. The raw token is returned
// exactly once at creation and only a hash is stored. A token cannot by itself
// grant access: it must be accepted by an authenticated user and then approved
// by school staff before a GuardianLink becomes active.
const invitationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

    contact: {
      name: { type: String, default: '', trim: true, maxlength: 160 },
      relationship: { type: String, default: '', trim: true, maxlength: 80 },
      phone: { type: String, default: '', trim: true, maxlength: 40 },
      email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    },

    tokenHash: { type: String, required: true, index: true },
    tokenPrefix: { type: String, default: '', trim: true, maxlength: 12 },

    permissions: { type: permissionsSchema, default: () => ({}) },
    status: { type: String, enum: INVITATION_STATUS, default: 'pending', index: true },
    expiresAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

invitationSchema.statics.hashToken = function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
};

invitationSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    student: this.student?.toString?.() || null,
    contact: this.contact,
    tokenPrefix: this.tokenPrefix,
    permissions: this.permissions,
    status: this.status,
    expiresAt: this.expiresAt,
    acceptedAt: this.acceptedAt,
    revokedAt: this.revokedAt,
    expired: this.status === 'pending' && this.expiresAt && this.expiresAt < new Date(),
    createdAt: this.createdAt,
  };
};

// An active relationship between a (future) parent account and a student.
const linkSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invitation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuardianInvitation',
      default: null,
    },

    relationship: { type: String, default: '', trim: true, maxlength: 80 },
    permissions: { type: permissionsSchema, default: () => ({}) },

    status: { type: String, enum: LINK_STATUS, default: 'pending', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

linkSchema.index({ owner: 1, student: 1, user: 1 }, { unique: true });

linkSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    student: this.student?.toString?.() || null,
    user: this.user?.toString?.() || null,
    relationship: this.relationship,
    permissions: this.permissions,
    status: this.status,
    approvedAt: this.approvedAt,
    revokedAt: this.revokedAt,
    createdAt: this.createdAt,
  };
};

export const GuardianInvitation = mongoose.model('GuardianInvitation', invitationSchema);
export const GuardianLink = mongoose.model('GuardianLink', linkSchema);
export default { GuardianInvitation, GuardianLink };
