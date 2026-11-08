import mongoose from 'mongoose';

const paymentSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  freeDays: { type: Number, default: 2, min: 0, max: 60 },
  amount: { type: Number, default: 0, min: 0, max: 100000000 },
  currency: { type: String, default: 'RWF', trim: true, maxlength: 12 },
  paymentCode: { type: String, default: '699655', trim: true, maxlength: 40 },
  paymentName: { type: String, default: 'Jean Claude', trim: true, maxlength: 120 },
  instructions: { type: String, default: '', trim: true, maxlength: 2000 },
}, { _id: false });

const projectSubmissionSettingsSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  title: { type: String, default: 'Project submission', trim: true, maxlength: 180 },
  instructions: { type: String, default: '', trim: true, maxlength: 4000 },
  allowGithub: { type: Boolean, default: true },
  allowOtherLinks: { type: Boolean, default: true },
  requireDescription: { type: Boolean, default: true },
}, { _id: false });

const learningClassSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  trade: { type: String, default: '', trim: true, maxlength: 120, index: true },
  introduction: { type: String, default: '', trim: true, maxlength: 500 },
  thumbnailFile: { type: String, default: '', maxlength: 200 },
  thumbnailPublicId: { type: String, default: '', maxlength: 255 },
  thumbnailUrl: { type: String, default: '', maxlength: 1000 },
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
  assessmentAttempts: { type: Number, default: 3, min: 1, max: 10 },
  assessmentPassMark: { type: Number, default: 80, min: 1, max: 100 },
  assessmentLockdown: { type: Boolean, default: true },
  minimumAttendanceSessions: { type: Number, default: 2, min: 0, max: 100 },
  projectSubmission: { type: projectSubmissionSettingsSchema, default: () => ({}) },
  payment: { type: paymentSettingsSchema, default: () => ({}) },
  course: { type: String, default: '', trim: true, maxlength: 160 },
  level: { type: String, default: 'Training', enum: ['L3', 'L4', 'L5', 'Bootcamp', 'Training'], index: true },
  description: { type: String, default: '', trim: true, maxlength: 12000 },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  enrollmentOpensAt: { type: Date, default: null },
  enrollmentClosesAt: { type: Date, default: null },
  schedule: { type: String, default: '', trim: true, maxlength: 500 },
  durationMinutes: { type: Number, default: 60, min: 5, max: 1440 },
  lateThresholdMinutes: { type: Number, default: 15, min: 0, max: 240 },
  earlyThresholdPercent: { type: Number, default: 75, min: 1, max: 100 },
  timezone: { type: String, default: 'Africa/Johannesburg', trim: true, maxlength: 80 },
  maxStudents: { type: Number, default: 300, min: 1, max: 10000 },
  enrollmentOpen: { type: Boolean, default: true },
  allowCancellation: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  active: { type: Boolean, default: true, index: true },
  published: { type: Boolean, default: true, index: true },
  archivedAt: { type: Date, default: null },
}, { timestamps: true });

learningClassSchema.index({ students: 1, active: 1 });
learningClassSchema.index({ published: 1, active: 1, level: 1, subject: 1, trade: 1 });
learningClassSchema.index({ title: 'text', subject: 'text', introduction: 'text', description: 'text' });

export const LearningClass = mongoose.model('LearningClass', learningClassSchema);
export default LearningClass;
