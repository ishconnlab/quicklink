import mongoose from 'mongoose';

const classChatMessageSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, maxlength: 120 },
  role: { type: String, enum: ['admin', 'owner', 'teacher', 'student'], required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  pinned: { type: Boolean, default: false },
  pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  removedAt: { type: Date, default: null },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reports: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: { type: String, trim: true, maxlength: 500 }, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

classChatMessageSchema.index({ session: 1, createdAt: 1 });
export const ClassChatMessage = mongoose.model('ClassChatMessage', classChatMessageSchema);
export default ClassChatMessage;

