import mongoose from 'mongoose';

const draftAnswerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true, min: 0, max: 99 },
  optionIndex: { type: Number, required: true, min: 0, max: 3 },
}, { _id: false });

const assessmentDraftSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  answers: { type: [draftAnswerSchema], default: [] },
  questionOrder: { type: [Number], default: [] },
  optionOrders: { type: [[Number]], default: [] },
  currentIndex: { type: Number, default: 0, min: 0, max: 99 },
  fullscreenExitCount: { type: Number, default: 0, min: 0 },
  interruptions: [{ type: { type: String, enum: ['tab-hidden', 'window-blur', 'fullscreen-exit', 'copy', 'context-menu', 'time-expired'], required: true }, occurredAt: { type: Date, default: Date.now } }],
  startedAt: { type: Date, default: Date.now },
  lastSavedAt: { type: Date, default: Date.now },
}, { timestamps: true });

assessmentDraftSchema.index({ student: 1, course: 1 }, { unique: true });

export const AssessmentDraft = mongoose.model('AssessmentDraft', assessmentDraftSchema);
export default AssessmentDraft;
