import mongoose from 'mongoose';

export const REGISTRATION_STATUSES = Object.freeze([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ENROLLED',
  'INVITED',
  'ATTENDED',
  'COMPLETED',
]);

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, enum: REGISTRATION_STATUSES, required: true },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '', maxlength: 1000 },
}, { _id: false });

const trainingRegistrationSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingRegistrationForm', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  normalizedEmail: { type: String, trim: true, lowercase: true, maxlength: 254, index: true },
  whatsapp: { type: String, required: true, trim: true, maxlength: 40 },
  normalizedPhone: { type: String, trim: true, maxlength: 40, index: true },
  answers: { type: Map, of: String, default: {} },
  status: { type: String, enum: REGISTRATION_STATUSES, default: 'PENDING', index: true },
  statusHistory: { type: [statusHistorySchema], default: [] },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  enrolledAt: { type: Date, default: null },
  invitedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizedPhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

trainingRegistrationSchema.pre('validate', function normalizeRegistration(next) {
  this.email = normalizedEmail(this.email);
  this.normalizedEmail = normalizedEmail(this.email);
  this.normalizedPhone = normalizedPhone(this.whatsapp);
  if (!this.status) this.status = 'PENDING';
  next();
});

trainingRegistrationSchema.index({ form: 1, email: 1 }, { unique: true });
trainingRegistrationSchema.index({ form: 1, status: 1, createdAt: -1 });
export const TrainingRegistration = mongoose.model('TrainingRegistration', trainingRegistrationSchema);
export default TrainingRegistration;
