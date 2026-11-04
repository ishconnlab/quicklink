import mongoose from 'mongoose';

const learningClassSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  trade: { type: String, default: '', trim: true, maxlength: 120, index: true },
  introduction: { type: String, default: '', trim: true, maxlength: 500 },
  thumbnailFile: { type: String, default: '', maxlength: 200 },
  learningMaterials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningBook' }],
  completionRequirements: {
    requireReading: { type: Boolean, default: false },
    requireTheory: { type: Boolean, default: false },
    requirePractical: { type: Boolean, default: false },
    requireAttendance: { type: Boolean, default: false },
    minimumScore: { type: Number, default: 0, min: 0, max: 100 },
  },
  certificationAssessmentEnabled: { type: Boolean, default: false },
  certificationQuestions: {
    type: [{
      prompt: { type: String, required: true, trim: true, maxlength: 1200 },
      options: {
        type: [{ type: String, required: true, trim: true, maxlength: 500 }],
        validate: { validator: (options) => options.length === 4, message: 'Each certification question must have four answer options.' },
      },
      correctOption: { type: Number, required: true, min: 0, max: 3 },
    }],
    default: [],
    validate: { validator: (questions) => questions.length === 0 || questions.length === 10, message: 'A certification assessment must contain exactly 10 questions.' },
  },
  course: { type: String, default: '', trim: true, maxlength: 160 },
  level: { type: String, required: true, enum: ['L3', 'L4', 'L5'], index: true },
  description: { type: String, default: '', trim: true, maxlength: 12000 },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startsAt: { type: Date, default: null },
  schedule: { type: String, default: '', trim: true, maxlength: 500 },
  durationMinutes: { type: Number, default: 60, min: 5, max: 1440 },
  lateThresholdMinutes: { type: Number, default: 15, min: 0, max: 240 },
  earlyThresholdPercent: { type: Number, default: 75, min: 1, max: 100 },
  timezone: { type: String, default: 'Africa/Johannesburg', trim: true, maxlength: 80 },
  maxStudents: { type: Number, default: 300, min: 1, max: 10000 },
  enrollmentOpen: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true, index: true },
  published: { type: Boolean, default: true, index: true },
  archivedAt: { type: Date, default: null },
}, { timestamps: true });

learningClassSchema.index({ teacher: 1, active: 1 });
learningClassSchema.index({ teachers: 1, active: 1 });
learningClassSchema.index({ students: 1, active: 1 });
learningClassSchema.index({ published: 1, active: 1, level: 1, subject: 1, trade: 1 });

export const LearningClass = mongoose.model('LearningClass', learningClassSchema);
export default LearningClass;
