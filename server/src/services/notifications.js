import { Notification } from '../models/Notification.js';

export async function notifyUsers(userIds, notification) {
  const recipients = [...new Set(userIds.map((id) => id?.toString()).filter(Boolean))];
  if (!recipients.length) return [];
  return Notification.insertMany(recipients.map((recipient) => ({ ...notification, recipient })), { ordered: false });
}

export default notifyUsers;
