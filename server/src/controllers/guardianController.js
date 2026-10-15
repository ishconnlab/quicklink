import crypto from 'crypto';
import { GuardianInvitation, GuardianLink } from '../models/Guardian.js';
import { Student } from '../models/Student.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { recordEvent } from '../services/admission.js';

export const inviteGuardian = asyncHandler(async (req, res) => {
  const { student: studentId, name, relationship, phone, email, permissions, expiresInDays } =
    req.body;

  const student = await Student.findOne({ _id: studentId, owner: req.user._id });
  if (!student) throw ApiError.badRequest('The selected student was not found');

  const rawToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + (expiresInDays || 14) * 24 * 60 * 60 * 1000);

  const invitation = new GuardianInvitation({
    owner: req.user._id,
    school: student.school,
    student: student._id,
    contact: { name: name || student.guardianName || '', relationship, phone, email },
    tokenHash: GuardianInvitation.hashToken(rawToken),
    tokenPrefix: rawToken.slice(0, 8),
    permissions: permissions || {},
    status: 'pending',
    expiresAt,
    createdBy: req.user._id,
  });
  await invitation.save();

  await recordEvent({
    owner: req.user._id,
    entityType: 'guardian',
    entity: invitation._id,
    action: 'invited',
    by: req.user._id,
    meta: { student: student._id.toString() },
  });

  // The raw token is returned exactly once and never stored.
  res.status(201).json({
    success: true,
    data: { invitation: invitation.toClient(), token: rawToken },
  });
});

export const listInvitations = asyncHandler(async (req, res) => {
  const filter = { owner: req.user._id };
  if (req.query.student) filter.student = req.query.student;
  const invitations = await GuardianInvitation.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { invitations: invitations.map((i) => i.toClient()) } });
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  const invitation = await GuardianInvitation.findOne({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!invitation) throw ApiError.notFound('Invitation not found');
  invitation.status = 'revoked';
  invitation.revokedAt = new Date();
  await invitation.save();
  res.json({ success: true, data: { invitation: invitation.toClient() } });
});

// Accepts an invitation as the authenticated user. The resulting link stays
// 'pending' until school staff approve it, so a token alone never grants access.
export const acceptInvitation = asyncHandler(async (req, res) => {
  const tokenHash = GuardianInvitation.hashToken(req.body.token);
  const invitation = await GuardianInvitation.findOne({ tokenHash });
  if (!invitation) throw ApiError.badRequest('This invitation is not valid');
  if (invitation.status === 'revoked') throw ApiError.conflict('This invitation was revoked');
  if (invitation.status === 'accepted') throw ApiError.conflict('This invitation was already used');
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw ApiError.conflict('This invitation has expired');
  }

  const existing = await GuardianLink.findOne({
    owner: invitation.owner,
    student: invitation.student,
    user: req.user._id,
  });

  const link =
    existing ||
    new GuardianLink({
      owner: invitation.owner,
      school: invitation.school,
      student: invitation.student,
      user: req.user._id,
      invitation: invitation._id,
      relationship: invitation.contact?.relationship || '',
      permissions: invitation.permissions,
      status: 'pending',
      createdBy: invitation.createdBy,
    });
  await link.save();

  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  invitation.acceptedBy = req.user._id;
  await invitation.save();

  await recordEvent({
    owner: invitation.owner,
    entityType: 'guardian',
    entity: link._id,
    action: 'invitation_accepted',
    by: req.user._id,
  });

  res.json({ success: true, data: { link: link.toClient() } });
});

export const listLinks = asyncHandler(async (req, res) => {
  const filter = { owner: req.user._id };
  if (req.query.student) filter.student = req.query.student;
  if (req.query.status) filter.status = req.query.status;
  const links = await GuardianLink.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('user', 'name email')
    .populate('student', 'fullName indexNumber');
  res.json({
    success: true,
    data: {
      links: links.map((l) => ({
        ...l.toClient(),
        parent: l.user ? { name: l.user.name, email: l.user.email } : null,
        studentName: l.student?.fullName || '',
        indexNumber: l.student?.indexNumber || '',
      })),
    },
  });
});

export const approveLink = asyncHandler(async (req, res) => {
  const link = await GuardianLink.findOne({ _id: req.params.id, owner: req.user._id });
  if (!link) throw ApiError.notFound('Guardian link not found');
  link.status = 'approved';
  link.approvedBy = req.user._id;
  link.approvedAt = new Date();
  await link.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'guardian',
    entity: link._id,
    action: 'link_approved',
    by: req.user._id,
  });
  res.json({ success: true, data: { link: link.toClient() } });
});

export const revokeLink = asyncHandler(async (req, res) => {
  const link = await GuardianLink.findOne({ _id: req.params.id, owner: req.user._id });
  if (!link) throw ApiError.notFound('Guardian link not found');
  link.status = 'revoked';
  link.revokedAt = new Date();
  await link.save();
  await recordEvent({
    owner: req.user._id,
    entityType: 'guardian',
    entity: link._id,
    action: 'link_revoked',
    by: req.user._id,
  });
  res.json({ success: true, data: { link: link.toClient() } });
});

// Guardian-facing: the students an authenticated user is approved to see.
export const myChildren = asyncHandler(async (req, res) => {
  const links = await GuardianLink.find({ user: req.user._id, status: 'approved' }).populate(
    'student'
  );
  res.json({
    success: true,
    data: {
      children: links
        .filter((l) => l.student)
        .map((l) => ({ link: l.toClient(), student: l.student.toClient() })),
    },
  });
});

export default {
  inviteGuardian,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
  listLinks,
  approveLink,
  revokeLink,
  myChildren,
};
