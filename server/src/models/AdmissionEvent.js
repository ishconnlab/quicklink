import mongoose from 'mongoose';

export const EVENT_ENTITY = ['application', 'pack', 'requirement', 'guardian', 'onboarding'];
export const DELIVERY_CHANNELS = ['in_app', 'email', 'sms', 'push'];
export const DELIVERY_STATUS = ['queued', 'sent', 'delivered', 'failed', 'unknown'];

// Append-only audit trail for admissions, packs, checklists and guardian links.
const admissionEventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    entityType: { type: String, enum: EVENT_ENTITY, required: true, index: true },
    entity: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', trim: true, maxlength: 1000 },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

admissionEventSchema.index({ owner: 1, entityType: 1, createdAt: -1 });

admissionEventSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    entityType: this.entityType,
    entity: this.entity?.toString?.() || null,
    action: this.action,
    note: this.note,
    at: this.createdAt,
  };
};

export const AdmissionEvent = mongoose.model('AdmissionEvent', admissionEventSchema);

// Records the delivery of a notification over a specific channel. Only the
// in_app channel is functional today; other channels report their real status
// ('unknown' / 'queued') rather than pretending to have been sent.
const notificationDeliverySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      default: null,
      index: true,
    },
    channel: { type: String, enum: DELIVERY_CHANNELS, required: true, index: true },
    recipient: { type: String, default: '', trim: true, maxlength: 200 },
    status: { type: String, enum: DELIVERY_STATUS, default: 'queued', index: true },
    provider: { type: String, default: '', trim: true, maxlength: 80 },
    error: { type: String, default: '', trim: true, maxlength: 500 },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationDeliverySchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    notification: this.notification?.toString?.() || null,
    channel: this.channel,
    recipient: this.recipient,
    status: this.status,
    provider: this.provider,
    createdAt: this.createdAt,
  };
};

export const NotificationDelivery = mongoose.model(
  'NotificationDelivery',
  notificationDeliverySchema
);

export default { AdmissionEvent, NotificationDelivery };
