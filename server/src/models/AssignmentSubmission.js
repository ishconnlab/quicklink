import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  text: { type: String, default: '', trim: true, maxlength: 12000 },
  selectedOption: { type: Number, min: 0 },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attempt: { type: Number, required: true, min: 1 },
  response: { type: String, default: '', trim: true, maxlength: 20000 },
  answers: { type: [answerSchema], default: [] },
  links: [{ type: String, trim: true, maxlength: 2048 }],
  files: [{ originalName: { type: String, required: true, maxlength: 240 }, storageKey: { type: String, required: true, maxlength: 80 }, mimeType: { type: String, required: true, maxlength: 100 }, size: { type: Number, required: true, min: 0 } }],
  submittedAt: { type: Date, default: null },
  status: { type: String, enum: ['draft', 'submitted', 'graded', 'passed', 'failed', 'revision-requested'], default: 'submitted', index: true },
  score: { type: Number, min: 0, default: null },
  feedback: { type: String, default: '', trim: true, maxlength: 8000 },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  gradedAt: { type: Date, default: null },
  gradingHistory: [{ score: { type: Number, min: 0 }, feedback: { type: String, maxlength: 8000 }, status: { type: String, enum: ['graded', 'passed', 'failed', 'revision-requested'] }, gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, gradedAt: { type: Date } }],
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1, attempt: 1 }, { unique: true });
submissionSchema.index({ assignment: 1, student: 1, submittedAt: -1 });
export const AssignmentSubmission = mongoose.model('AssignmentSubmission', submissionSchema);
export default AssignmentSubmission;
