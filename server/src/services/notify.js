import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';

// Deliver an in-app notification to every active account owner. Failures are
// swallowed by callers so notification delivery never blocks the main action.
export async function notifyOwners({ type = 'info', title, message = '', link = '', meta = {} }) {
  const owners = await User.find({ role: 'owner', isActive: true }).select('_id');
  if (owners.length === 0) return [];
  return Notification.insertMany(
    owners.map((owner) => ({ user: owner._id, type, title, message, link, meta }))
  );
}

export default notifyOwners;
