import mongoose from 'mongoose';

export const CONVERSATION_STATUS = ['open', 'archived'];

// A school ↔ guardian conversation, always about one student on one account.
const conversationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    // Owner (staff) plus every approved guardian user for the student.
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },
    subject: { type: String, default: '', trim: true, maxlength: 200 },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '', trim: true, maxlength: 200 },
    status: { type: String, enum: CONVERSATION_STATUS, default: 'open', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One conversation per student per account.
conversationSchema.index({ owner: 1, student: 1 }, { unique: true });

conversationSchema.methods.hasParticipant = function hasParticipant(userId) {
  return this.participants.some((p) => String(p) === String(userId));
};

conversationSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    school: this.school?.toString?.() || null,
    student: this.student?.toString?.() || null,
    subject: this.subject,
    lastMessageAt: this.lastMessageAt,
    lastMessagePreview: this.lastMessagePreview,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Conversation = mongoose.model('Conversation', conversationSchema);

const messageSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['staff', 'parent'], default: 'staff' },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

messageSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    conversation: this.conversation?.toString?.() || null,
    sender: this.sender?.toString?.() || null,
    senderRole: this.senderRole,
    body: this.body,
    createdAt: this.createdAt,
  };
};

export const Message = mongoose.model('Message', messageSchema);

export default { Conversation, Message };
