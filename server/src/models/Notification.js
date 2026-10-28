import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['class', 'invitation', 'assignment', 'grade', 'announcement', 'account'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  message: { type: String, default: '', trim: true, maxlength: 1000 },
  href: { type: String, default: '' },
  readAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
