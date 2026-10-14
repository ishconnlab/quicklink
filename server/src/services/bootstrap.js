import { User } from '../models/User.js';
import config from '../config/env.js';

// Ensure at least one owner account exists. This is the only way an account is
// created without an authenticated user; after this, all accounts are created
// by signed-in users. No public registration endpoint exists.
export async function ensureOwnerAccount() {
  const count = await User.countDocuments({});
  if (count > 0) return null;

  const existing = await User.findOne({ email: config.owner.email });
  if (existing) return existing;

  const user = new User({ name: config.owner.name, email: config.owner.email });
  await user.setPassword(config.owner.password);
  await user.save();

  console.log(`[bootstrap] Created initial owner account: ${user.email}`);
  return user;
}

export default ensureOwnerAccount;
