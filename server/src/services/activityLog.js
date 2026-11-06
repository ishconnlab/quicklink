import { ActivityLog } from '../models/ActivityLog.js';

export async function recordActivity(req, { action, resourceType = '', resourceId = '', message = '', metadata = {} } = {}) {
  try {
    await ActivityLog.create({
      actor: req?.user?._id || null,
      actorName: req?.user?.name || 'System',
      actorRole: req?.user?.role || 'system',
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : '',
      message,
      metadata,
      ip: req?.ip || req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() || '',
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 500),
    });
  } catch (error) {
    console.warn('[activity] Could not record activity:', error.message);
  }
  return null;
}

export default recordActivity;
