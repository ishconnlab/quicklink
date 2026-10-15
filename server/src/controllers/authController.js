import { User } from '../models/User.js';
import { GuardianInvitation, GuardianLink } from '../models/Guardian.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken } from '../utils/token.js';
import { notifyOwners } from '../services/notify.js';
import { recordEvent } from '../services/admission.js';

// Public self-registration. New accounts are created in 'pending' state and
// cannot sign in until an account owner approves them.
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = new User({
    name,
    email,
    role: 'user',
    approvalStatus: 'pending',
  });
  await user.setPassword(password);
  await user.save();

  // Notify account owners so the request can be reviewed promptly. Delivery
  // failures must never block a successful registration.
  try {
    await notifyOwners({
      type: 'registration',
      title: 'New account awaiting approval',
      message: `${user.name} (${user.email}) requested access.`,
      link: '/settings',
      meta: { userId: user._id.toString() },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] Failed to notify owners of new registration:', err.message);
  }

  res.status(201).json({
    success: true,
    data: {
      user: {
        name: user.name,
        email: user.email,
        approvalStatus: user.approvalStatus,
      },
      message: 'Registration received. An account owner will review and approve your account.',
    },
  });
});

// Parent self-registration via a school invitation. Possession of a valid
// invitation authorises the account, but the guardian link still requires
// school approval before any student data is visible.
export const registerParent = asyncHandler(async (req, res) => {
  const { token, name, email, password, relationship } = req.body;

  const tokenHash = GuardianInvitation.hashToken(token);
  const invitation = await GuardianInvitation.findOne({ tokenHash });
  if (!invitation) throw ApiError.badRequest('This invitation is not valid');
  if (invitation.status === 'revoked') throw ApiError.conflict('This invitation was revoked');
  if (invitation.status === 'accepted') throw ApiError.conflict('This invitation was already used');
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw ApiError.conflict('This invitation has expired');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict(
      'An account with this email already exists. Sign in and accept the invitation instead.'
    );
  }

  const user = new User({ name, email, role: 'parent', approvalStatus: 'approved' });
  await user.setPassword(password);
  await user.save();

  const link = new GuardianLink({
    owner: invitation.owner,
    school: invitation.school,
    student: invitation.student,
    user: user._id,
    invitation: invitation._id,
    relationship: relationship || invitation.contact?.relationship || '',
    permissions: invitation.permissions,
    status: 'pending',
    createdBy: invitation.createdBy,
  });
  await link.save();

  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  invitation.acceptedBy = user._id;
  await invitation.save();

  await recordEvent({
    owner: invitation.owner,
    entityType: 'guardian',
    entity: link._id,
    action: 'parent_registered',
    by: user._id,
    meta: { student: invitation.student.toString() },
  });

  await notifyOwners({
    type: 'guardian',
    title: 'A guardian connected to a student',
    message: `${user.name} (${user.email}) used an invitation and is awaiting your approval.`,
    link: '/admissions',
    meta: { linkId: link._id.toString() },
  }).catch(() => {});

  res.status(201).json({
    success: true,
    data: { token: signToken(user), user: user.toSafeJSON(), link: link.toClient() },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Generic message so we never reveal whether the email exists.
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const ok = await user.verifyPassword(password);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.approvalStatus === 'pending') {
    throw ApiError.forbidden('Your account is awaiting approval by an account owner.');
  }
  if (user.approvalStatus === 'rejected') {
    throw ApiError.forbidden('Your registration was not approved.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    data: {
      token: signToken(user),
      user: user.toSafeJSON(),
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = await user.verifyPassword(currentPassword);
  if (!ok) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  await user.setPassword(newPassword);
  await user.save();

  res.json({ success: true, data: { message: 'Password updated successfully' } });
});

export default { register, registerParent, login, me, changePassword };
