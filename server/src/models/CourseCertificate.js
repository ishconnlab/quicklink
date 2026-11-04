import mongoose from 'mongoose';

const certificateSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  studentName: { type: String, required: true, trim: true, maxlength: 120 },
  courseTitle: { type: String, required: true, trim: true, maxlength: 160 },
  level: { type: String, enum: ['L3', 'L4', 'L5', 'Bootcamp', 'Training'], required: true },
  issuedAt: { type: Date, required: true, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revocationReason: { type: String, default: '', trim: true, maxlength: 1000 },
}, { timestamps: true });

certificateSchema.index({ student: 1, course: 1 }, { unique: true });
export const CourseCertificate = mongoose.model('CourseCertificate', certificateSchema);
export default CourseCertificate;
