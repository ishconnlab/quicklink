import { Conversation, Message } from '../models/Conversation.js';
import { GuardianLink } from '../models/Guardian.js';
import { Student } from '../models/Student.js';
import { Notification } from '../models/Notification.js';
import { NotificationDelivery } from '../models/AdmissionEvent.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const isParent = (user) => user.role === 'parent';

// Loads a conversation the requester is allowed to see: staff must own the
// account, parents must be an approved participant.
async function resolveConversation(user, id) {
  const conversation = await Conversation.findById(id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (isParent(user)) {
    if (!conversation.hasParticipant(user._id)) {
      throw ApiError.forbidden('You do not have access to this conversation');
    }
  } else if (String(conversation.owner) !== String(user._id)) {
    throw ApiError.notFound('Conversation not found');
  }
  return conversation;
}

async function unreadFor(userId, conversationId) {
  return Message.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    readBy: { $ne: userId },
  });
}

export const listConversations = asyncHandler(async (req, res) => {
  const filter = isParent(req.user)
    ? { participants: req.user._id }
    : { owner: req.user._id };

  const conversations = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(200)
    .populate('student', 'fullName indexNumber schoolName');

  const data = await Promise.all(
    conversations.map(async (c) => ({
      ...c.toClient(),
      studentName: c.student?.fullName || '',
      indexNumber: c.student?.indexNumber || '',
      schoolName: c.student?.schoolName || '',
      unread: await unreadFor(req.user._id, c._id),
    }))
  );

  res.json({ success: true, data: { conversations: data } });
});

// Staff: get (or create) the single conversation for a student, wiring in every
// approved guardian of that student as a participant.
export const ensureConversation = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.body.student, owner: req.user._id });
  if (!student) throw ApiError.badRequest('The selected student was not found');

  const links = await GuardianLink.find({
    owner: req.user._id,
    student: student._id,
    status: 'approved',
  }).select('user');
  const participants = [req.user._id, ...links.map((l) => l.user)];

  let conversation = await Conversation.findOne({ owner: req.user._id, student: student._id });
  if (!conversation) {
    conversation = new Conversation({
      owner: req.user._id,
      school: student.school,
      student: student._id,
      participants,
      subject: req.body.subject || '',
      createdBy: req.user._id,
      lastMessageAt: new Date(),
    });
  } else {
    // Keep participants in sync with the current approved links.
    conversation.participants = participants;
  }
  await conversation.save();
  res.json({ success: true, data: { conversation: conversation.toClient() } });
});

export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await resolveConversation(req.user, req.params.id);
  res.json({ success: true, data: { conversation: conversation.toClient() } });
});

export const listMessages = asyncHandler(async (req, res) => {
  const conversation = await resolveConversation(req.user, req.params.id);
  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: 1 })
    .limit(500);

  // Reading the thread marks everything from the other side as read.
  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  res.json({
    success: true,
    data: {
      conversation: conversation.toClient(),
      messages: messages.map((m) => m.toClient()),
    },
  });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await resolveConversation(req.user, req.params.id);
  const senderRole = isParent(req.user) ? 'parent' : 'staff';

  const message = await Message.create({
    owner: conversation.owner,
    conversation: conversation._id,
    sender: req.user._id,
    senderRole,
    body: req.body.body,
    readBy: [req.user._id],
  });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = req.body.body.slice(0, 200);
  if (!conversation.hasParticipant(req.user._id)) {
    conversation.participants.push(req.user._id);
  }
  await conversation.save();

  // In-app notify every other participant.
  const recipients = conversation.participants.filter((p) => String(p) !== String(req.user._id));
  await Promise.all(
    recipients.map(async (userId) => {
      const notification = await Notification.create({
        user: userId,
        type: 'info',
        title: senderRole === 'staff' ? 'New message from the school' : 'New message from a guardian',
        message: req.body.body.slice(0, 160),
        link: '/messages',
        meta: { conversation: conversation._id.toString() },
      });
      await NotificationDelivery.create({
        owner: conversation.owner,
        notification: notification._id,
        channel: 'in_app',
        recipient: String(userId),
        status: 'sent',
        provider: 'quicklink',
        sentAt: new Date(),
      });
    })
  );

  res.status(201).json({ success: true, data: { message: message.toClient() } });
});

export const markRead = asyncHandler(async (req, res) => {
  const conversation = await resolveConversation(req.user, req.params.id);
  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ success: true, data: { ok: true } });
});

export default {
  listConversations,
  ensureConversation,
  getConversation,
  listMessages,
  sendMessage,
  markRead,
};
