import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true, min: 0, max: 49 },
  optionIndex: { type: Number, required: true, min: 0, max: 3 },
}, { _id: false });

const learningAssessmentAttemptSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningBook', required: true, index: true },
  attemptNumber: { type: Number, required: true, min: 1, max: 20 },
  answers: { type: [answerSchema], default: [] },
  score: { type: Number, required: true, min: 0, max: 100 },
  passed: { type: Boolean, required: true, index: true },
  violation: { type: String, enum: ['', 'tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'screenshot_shortcut'], default: '' },
  submittedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

learningAssessmentAttemptSchema.index({ student: 1, book: 1, attemptNumber: 1 }, { unique: true });
export const LearningAssessmentAttempt = mongoose.model('LearningAssessmentAttempt', learningAssessmentAttemptSchema);
export default LearningAssessmentAttempt;

