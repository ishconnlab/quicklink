import mongoose from 'mongoose';

const classInvitationSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, default: null, select: false },
  status: { type: String, enum: ['pending', 'sent', 'accepted', 'expired', 'failed', 'revoked'], default: 'pending', index: true },
  expiresAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: '', maxlength: 500 },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

classInvitationSchema.index({ learningClass: 1, student: 1, status: 1 });
export const ClassInvitation = mongoose.model('ClassInvitation', classInvitationSchema);
export default ClassInvitation;
