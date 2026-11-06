import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorName: { type: String, default: '', maxlength: 120 },
  actorRole: { type: String, default: '', maxlength: 20 },
  action: { type: String, required: true, maxlength: 120, index: true },
  resourceType: { type: String, default: '', maxlength: 80, index: true },
  resourceId: { type: String, default: '', maxlength: 120, index: true },
  message: { type: String, default: '', maxlength: 1000 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '', maxlength: 80 },
  userAgent: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

activityLogSchema.index({ createdAt: -1 });
export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;
