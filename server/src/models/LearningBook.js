import mongoose from 'mongoose';

const assessmentQuestionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true, maxlength: 1200 },
  options: {
    type: [{ type: String, required: true, trim: true, maxlength: 500 }],
    validate: { validator: (options) => options.length === 4, message: 'Each question must have four answer options.' },
  },
  correctOption: { type: Number, required: true, min: 0, max: 3 },
}, { _id: false });

const learningBookSchema = new mongoose.Schema({
  sourceKey: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  category: { type: String, required: true, trim: true, maxlength: 120 },
  level: { type: String, required: true, enum: ['L3', 'L4', 'L5'], index: true },
  fileName: { type: String, required: true },
  coverFile: { type: String, default: '', maxlength: 80 },
  assessmentQuestions: {
    type: [assessmentQuestionSchema],
    default: [],
    validate: { validator: (questions) => questions.length <= 50, message: 'A final assessment cannot contain more than 50 questions.' },
  },
  format: { type: String, enum: ['pdf', 'doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'xls', 'xlsx'], default: 'pdf', index: true },
  mimeType: { type: String, default: 'application/pdf' },
  size: { type: Number, required: true, min: 0 },
  fileModifiedAt: { type: Date, default: null },
  active: { type: Boolean, default: true, index: true },
  processingStatus: { type: String, enum: ['ready', 'error', 'missing'], default: 'ready', index: true },
  processingError: { type: String, default: '', maxlength: 500 },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

learningBookSchema.index({ level: 1, category: 1, format: 1, active: 1 });

export const LearningBook = mongoose.model('LearningBook', learningBookSchema);
export default LearningBook;

