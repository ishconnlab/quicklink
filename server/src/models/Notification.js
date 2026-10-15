import mongoose from 'mongoose';

// In-app notifications delivered to a single user (e.g. the owner is notified
// when a new account registers and needs approval).
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['registration', 'student', 'admission', 'guardian', 'info'],
      default: 'info',
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, default: '', trim: true, maxlength: 1000 },
    // Optional in-app route the notification deep-links to.
    link: { type: String, default: '', trim: true, maxlength: 300 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

notificationSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    type: this.type,
    title: this.title,
    message: this.message,
    link: this.link,
    read: this.read,
    createdAt: this.createdAt,
  };
};

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
