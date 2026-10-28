import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { Notification } from '../models/Notification.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const filter = { recipient: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  res.json({ success: true, data: { notifications: items.map((item) => ({ id: item._id.toString(), type: item.type, title: item.title, message: item.message, href: item.href, readAt: item.readAt, createdAt: item.createdAt })), unreadCount } });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ success: true, data: { id: notification._id.toString(), readAt: notification.readAt } });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true, data: { updated: result.modifiedCount } });
});

export default { listNotifications, markNotificationRead, markAllNotificationsRead };
