import mongoose from 'mongoose';

const courseLearningProgressSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true },
  completedLessons: [{ type: mongoose.Schema.Types.ObjectId }],
  lessonCompletions: [{
    lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
    completedAt: { type: Date, default: Date.now },
  }],
  currentLesson: { type: mongoose.Schema.Types.ObjectId, default: null },
  assessmentAttempts: [{
    lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
    answers: [{ type: Number, min: 0, max: 3 }],
    score: { type: Number, min: 0, max: 100 },
    passed: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
  }],
  securityEvents: [{
    lessonId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['tab-hidden', 'window-blur', 'fullscreen-exit', 'copy', 'context-menu'], required: true },
    occurredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

courseLearningProgressSchema.index({ student: 1, course: 1 }, { unique: true });

export const CourseLearningProgress = mongoose.model('CourseLearningProgress', courseLearningProgressSchema);
export default CourseLearningProgress;
