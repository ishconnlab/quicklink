import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true, min: 0, max: 99 },
  optionIndex: { type: Number, required: true, min: 0, max: 3 },
}, { _id: false });

const certificationAssessmentAttemptSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  attemptNumber: { type: Number, required: true, min: 1, max: 20 },
  answers: { type: [answerSchema], default: [] },
  interruptions: [{ type: { type: String, enum: ['tab-hidden', 'window-blur', 'fullscreen-exit', 'copy', 'context-menu', 'time-expired'], required: true }, occurredAt: { type: Date, default: Date.now } }],
  score: { type: Number, required: true, min: 0, max: 100 },
  passed: { type: Boolean, required: true, index: true },
  submittedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

certificationAssessmentAttemptSchema.index({ student: 1, course: 1, attemptNumber: 1 }, { unique: true });
export const CertificationAssessmentAttempt = mongoose.model('CertificationAssessmentAttempt', certificationAssessmentAttemptSchema);
export default CertificationAssessmentAttempt;

