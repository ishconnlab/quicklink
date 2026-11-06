import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true, maxlength: 2000 },
  type: { type: String, enum: ['text', 'single-choice'], default: 'text' },
  options: [{ type: String, trim: true, maxlength: 500 }],
  correctOption: { type: Number, min: 0 },
  points: { type: Number, min: 0, max: 1000, default: 1 },
}, { _id: true });

const assignmentSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  instructions: { type: String, default: '', trim: true, maxlength: 12000 },
  objectives: { type: String, default: '', trim: true, maxlength: 4000 },
  toolsAndMaterials: { type: String, default: '', trim: true, maxlength: 4000 },
  tasks: [{ type: String, trim: true, maxlength: 2000 }],
  submissionRequirements: { type: String, default: '', trim: true, maxlength: 4000 },
  submissionTypes: [{ type: String, enum: ['text', 'link', 'file'] }],
  rubric: [{ criterion: { type: String, trim: true, maxlength: 500 }, points: { type: Number, min: 0, max: 10000 } }],
  type: { type: String, enum: ['assignment', 'practical', 'quiz'], default: 'assignment' },
  questions: { type: [questionSchema], default: [] },
  dueAt: { type: Date, default: null, index: true },
  maxPoints: { type: Number, min: 0, max: 10000, default: 100 },
  passMark: { type: Number, min: 0, max: 10000, default: 50 },
  allowLate: { type: Boolean, default: false },
  allowResubmission: { type: Boolean, default: true },
  published: { type: Boolean, default: false, index: true },
}, { timestamps: true });

assignmentSchema.index({ learningClass: 1, published: 1, dueAt: 1 });
export const Assignment = mongoose.model('Assignment', assignmentSchema);
export default Assignment;
