import mongoose from 'mongoose';

const classSessionNoteSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, unique: true, index: true },
  content: { type: String, default: '', maxlength: 20000 },
  revision: { type: Number, default: 0, min: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export const ClassSessionNote = mongoose.model('ClassSessionNote', classSessionNoteSchema);
export default ClassSessionNote;
