import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    entity: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: {
      type: String,
      enum: ['create', 'update', 'archive', 'restore', 'delete'],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

auditLogSchema.index({ entityId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
