import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { getLearningSettings, updateLearningSettings } from '../services/settings.js';
import { recordActivity } from '../services/activityLog.js';

export const listActivity = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.resourceType) filter.resourceType = req.query.resourceType;
  const [entries, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: {
    activity: entries.map((entry) => ({
      id: entry._id.toString(),
      actorName: entry.actorName,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      message: entry.message,
      metadata: entry.metadata,
      ip: entry.ip,
      createdAt: entry.createdAt,
    })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  } });
});

export const getSettings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { settings: await getLearningSettings({ fresh: true }) } });
});

export const saveSettings = asyncHandler(async (req, res) => {
  const settings = await updateLearningSettings(req.body, req.user);
  await recordActivity(req, {
    action: 'settings.updated',
    resourceType: 'settings',
    message: 'Learning completion and assessment settings were updated.',
    metadata: settings,
  });
  res.json({ success: true, data: { settings } });
});

export default { listActivity, getSettings, saveSettings };
