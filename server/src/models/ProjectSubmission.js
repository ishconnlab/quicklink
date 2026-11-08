import mongoose from 'mongoose';

const projectSubmissionSchema = new mongoose.Schema({
  learningClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningClass', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  linkUrl: { type: String, required: true, trim: true, maxlength: 2000 },
  description: { type: String, default: '', trim: true, maxlength: 4000 },
  status: { type: String, enum: ['submitted', 'approved', 'changes_requested'], default: 'submitted', index: true },
  feedback: { type: String, default: '', trim: true, maxlength: 2000 },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

projectSubmissionSchema.index({ learningClass: 1, student: 1 }, { unique: true });

export const ProjectSubmission = mongoose.model('ProjectSubmission', projectSubmissionSchema);
export default ProjectSubmission;
