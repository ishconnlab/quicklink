import { Notification } from '../models/Notification.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Notifications are always scoped to the authenticated user.
export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
  const filter = { user: req.user._id };
  if (req.query.unread === '1' || req.query.unread === 'true') filter.read = false;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);

  res.json({
    success: true,
    data: { notifications: items.map((n) => n.toClient()), unreadCount },
  });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ success: true, data: { notification: notification.toClient() } });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ success: true, data: { message: 'All notifications marked as read' } });
});

export default { listNotifications, markRead, markAllRead };
