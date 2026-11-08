import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import config from '../config/env.js';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { ClassInvitation } from '../models/ClassInvitation.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { assertCanManageClass } from '../security/roles.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const inviteJson = (item) => ({
  id: item._id.toString(),
  email: item.email,
  whatsapp: item.whatsapp || '',
  whatsappUrl: item.whatsappUrl || '',
  studentId: (item.student?._id || item.student).toString(),
  studentName: item.student?.name || '',
  status: item.status,
  expiresAt: item.expiresAt,
  sentAt: item.sentAt,
  acceptedAt: item.acceptedAt,
  lastError: item.lastError,
});
let invitationTransport;

function getInvitationTransport() {
  if (!invitationTransport) {
    const smtp = new URL(config.mail.smtpUrl);
    if (!['smtp:', 'smtps:'].includes(smtp.protocol)) throw new Error('SMTP_URL must use smtp:// or smtps://.');
    const secure = smtp.protocol === 'smtps:';
    invitationTransport = nodemailer.createTransport({
      host: smtp.hostname,
      port: Number(smtp.port || (secure ? 465 : 587)),
      secure,
      auth: smtp.username || smtp.password ? {
        user: decodeURIComponent(smtp.username),
        pass: decodeURIComponent(smtp.password),
      } : undefined,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return invitationTransport;
}

async function canManage(item, user) {
  assertCanManageClass(user, item);
}

function invitationDetails(classItem) {
  return [
    `Training: ${classItem.course || classItem.title}`,
    `Class: ${classItem.title} (${classItem.level} - ${classItem.subject})`,
    classItem.startsAt ? `Start: ${new Date(classItem.startsAt).toLocaleString('en', { timeZone: classItem.timezone || 'UTC', timeZoneName: 'short' })}` : '',
    classItem.schedule ? `Schedule: ${classItem.schedule}` : '',
    `Duration: ${classItem.durationMinutes || 60} minutes`,
    'Managed by: QuickLink administrators',
  ].filter(Boolean);
}

function whatsappLink(whatsapp, message) {
  const digits = String(whatsapp || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function emailContent(classItem, student, url) {
  const details = invitationDetails(classItem);
  return {
    to: student.email,
    subject: `QuickLink class invitation: ${classItem.title}`,
    text: `Hello ${student.name},\n\nYou have been invited to join a QuickLink class.\n\n${details.join('\n')}\n\nSign in with your registered QuickLink account to continue:\n${url}\n\nThis invitation link expires in 7 days. It only works for the student account it was sent to.`,
    html: `<p>Hello ${escapeHtml(student.name)},</p><p>You have been invited to join a QuickLink class.</p><ul>${details.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p><a href="${escapeHtml(url)}">Join class</a></p><p>This invitation expires in 7 days and only works for your registered QuickLink account.</p>`,
  };
}

async function sendInvitation(invite, classItem, student) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  invite.tokenHash = hashToken(token);
  invite.expiresAt = expiresAt;
  invite.status = 'pending';
  invite.lastError = '';
  invite.whatsapp = student.whatsapp || '';
  const url = config.mail.appUrl ? new URL(`/classes/invitations/${token}`, config.mail.appUrl).toString() : '';
  const message = `Hello ${student.name},\n\nYou have been invited to join the QuickLink class "${classItem.title}".\n\n${invitationDetails(classItem).join('\n')}\n\n${url ? `Sign in with your registered QuickLink account to continue:\n${url}\n\n` : ''}This invitation expires in 7 days.`;
  invite.whatsappUrl = whatsappLink(student.whatsapp, message);
  await invite.save();
  if (!config.mail.smtpUrl || !config.mail.from || !config.mail.appUrl) {
    invite.status = 'failed';
    invite.lastError = 'Email service is not configured (SMTP_URL, MAIL_FROM, APP_URL).';
    await invite.save();
    return invite;
  }
  try {
    const transport = getInvitationTransport();
    await transport.sendMail({ from: config.mail.from, ...emailContent(classItem, student, url) });
    invite.status = 'sent';
    invite.sentAt = new Date();
    await invite.save();
  } catch (error) {
    invite.status = 'failed';
    invite.lastError = String(error?.message || 'Invitation email could not be sent').slice(0, 500);
    await invite.save();
  }
  return invite;
}

async function markRegistrationInvited(learningClassId, studentId, sentBy) {
  const formIds = await TrainingRegistrationForm.find({ learningClass: learningClassId }).distinct('_id');
  if (!formIds.length) return;
  await TrainingRegistration.updateMany(
    { form: { $in: formIds }, student: studentId, status: 'ENROLLED' },
    {
      $set: { status: 'INVITED', invitedAt: new Date() },
      $push: { statusHistory: { status: 'INVITED', at: new Date(), by: sentBy, note: 'Class invitation sent.' } },
    },
  );
}

export const listInvitations = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await canManage(item, req.user);
  const invites = await ClassInvitation.find({ learningClass: item._id }).populate('student', 'name email whatsapp').sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ success: true, data: { invitations: invites.map(inviteJson) } });
});

export const sendInvitations = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await canManage(item, req.user);
  const ids = [...new Set(req.body.studentIds.map(String))];
  const enrolled = new Set(item.students.map(String));
  if (ids.some((id) => !enrolled.has(id))) throw ApiError.forbidden('Invitations can only be sent to students enrolled in this training.');
  const students = await User.find({ _id: { $in: ids }, role: 'student', isActive: true }).select('name email whatsapp');
  if (students.length !== ids.length) throw ApiError.badRequest('One or more students are no longer active.');
  const invitations = await Promise.all(students.map(async (student) => {
    let invite = await ClassInvitation.findOne({ learningClass: item._id, student: student._id }).sort({ createdAt: -1 });
    if (invite && ['sent', 'pending', 'accepted'].includes(invite.status) && (!invite.expiresAt || invite.expiresAt > new Date())) {
      return inviteJson(invite);
    }
    if (!invite) invite = new ClassInvitation({ learningClass: item._id, student: student._id, email: student.email, sentBy: req.user._id });
    const sent = await sendInvitation(invite, item, student);
    if (sent.status === 'sent' || sent.status === 'accepted') await markRegistrationInvited(item._id, student._id, req.user._id);
    return inviteJson(sent);
  }));
  res.status(200).json({ success: true, data: { invitations } });
});

export const resendInvitation = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await canManage(item, req.user);
  const invite = await ClassInvitation.findOne({ _id: req.params.invitationId, learningClass: item._id });
  if (!invite) throw ApiError.notFound('Invitation not found.');
  if (invite.status === 'accepted') throw ApiError.conflict('This invitation has already been accepted.');
  if (invite.status === 'revoked') throw ApiError.conflict('This invitation has been revoked.');
  const student = await User.findOne({ _id: invite.student, role: 'student', isActive: true }).select('name email whatsapp');
  if (!student) throw ApiError.conflict('The student account is no longer active.');
  invite.sentBy = req.user._id;
  const result = await sendInvitation(invite, item, student);
  if (result.status === 'sent') await markRegistrationInvited(item._id, student._id, req.user._id);
  res.json({ success: true, data: { invitation: inviteJson(result) } });
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.id);
  await canManage(item, req.user);
  const invite = await ClassInvitation.findOneAndUpdate({ _id: req.params.invitationId, learningClass: item._id, status: { $nin: ['accepted', 'revoked'] } }, { $set: { status: 'revoked', tokenHash: null, expiresAt: null, whatsappUrl: '' } }, { new: true });
  if (!invite) throw ApiError.notFound('Invitation not found or already accepted.');
  res.json({ success: true, data: { invitation: inviteJson(invite) } });
});

export const acceptInvitation = asyncHandler(async (req, res) => {
  const invite = await ClassInvitation.findOne({ tokenHash: hashToken(req.params.token) });
  if (!invite || invite.status !== 'sent') throw ApiError.notFound('This invitation is invalid or no longer available.');
  if (invite.expiresAt < new Date()) {
    invite.status = 'expired';
    invite.tokenHash = null;
    await invite.save();
    throw ApiError.conflict('This invitation has expired. Ask your administrator to send a new one.');
  }
  if (invite.student.toString() !== req.user._id.toString() || invite.email !== req.user.email) throw ApiError.forbidden('Sign in with the student account this invitation was sent to.');
  const item = await LearningClass.findOne({ _id: invite.learningClass, active: true, students: req.user._id });
  if (!item) throw ApiError.forbidden('You are no longer enrolled in this class.');
  invite.status = 'accepted';
  invite.acceptedAt = new Date();
  invite.tokenHash = null;
  await invite.save();
  const liveSession = await LiveSession.findOne({ learningClass: item._id, status: 'live' }).sort({ startedAt: -1 });
  res.json({ success: true, data: { classId: item._id.toString(), sessionId: liveSession?._id.toString() || null } });
});

export default { listInvitations, sendInvitations, resendInvitation, revokeInvitation, acceptInvitation };

