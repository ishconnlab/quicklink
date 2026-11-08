import mongoose from 'mongoose';

export const PAYMENT_STATUSES = Object.freeze([
  'not_required',
  'unpaid',
  'pending',
  'paid',
  'rejected',
  'waived',
]);

const enrollmentSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['enrolled', 'cancelled'], default: 'enrolled', index: true },
  enrolledAt: { type: Date, default: Date.now },
  cancelledAt: { type: Date, default: null },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'not_required', index: true },
  paymentAmount: { type: Number, default: 0, min: 0 },
  paymentCurrency: { type: String, default: 'RWF', trim: true, maxlength: 12 },
  paymentReference: { type: String, default: '', trim: true, maxlength: 200 },
  paymentNote: { type: String, default: '', trim: true, maxlength: 1000 },
  paymentSubmittedAt: { type: Date, default: null },
  paymentVerifiedAt: { type: Date, default: null },
  paymentVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

enrollmentSchema.index({ learningClass: 1, student: 1 }, { unique: true });
enrollmentSchema.index({ learningClass: 1, status: 1, paymentStatus: 1 });
enrollmentSchema.index({ student: 1, status: 1 });

export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
export default Enrollment;
