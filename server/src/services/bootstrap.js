import { User } from '../models/User.js';
import config from '../config/env.js';

// Ensure at least one owner account exists. The owner approves new
// registrations and owns the initial (seeded) data set.
export async function ensureOwnerAccount() {
  const count = await User.countDocuments({});
  if (count > 0) return null;

  const existing = await User.findOne({ email: config.owner.email });
  if (existing) return existing;

  const user = new User({
    name: config.owner.name,
    email: config.owner.email,
    role: 'owner',
    approvalStatus: 'approved',
  });
  await user.setPassword(config.owner.password);
  await user.save();

  console.log(`[bootstrap] Created initial owner account: ${user.email}`);
  return user;
}

export default ensureOwnerAccount;
