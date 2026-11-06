import mongoose from 'mongoose';

const learningProgressSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningBook', required: true, index: true },
  currentPage: { type: Number, default: 1, min: 1 },
  totalPages: { type: Number, default: 0, min: 0 },
  positionType: { type: String, enum: ['page', 'slide', 'section', 'sheet', 'document'], default: 'page' },
  positionIndex: { type: Number, default: 1, min: 0 },
  positionLabel: { type: String, default: '', trim: true, maxlength: 240 },
  furthestPosition: { type: Number, default: 1, min: 0 },
  totalUnits: { type: Number, default: 0, min: 0 },
  progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  scrollPercent: { type: Number, default: 0, min: 0, max: 100 },
  timeSpentSeconds: { type: Number, default: 0, min: 0 },
  completed: { type: Boolean, default: false, index: true },
  lastOpenedAt: { type: Date, default: Date.now, index: true },
  lastReadAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

learningProgressSchema.index({ student: 1, book: 1 }, { unique: true });
export const LearningProgress = mongoose.model('LearningProgress', learningProgressSchema);
export default LearningProgress;

