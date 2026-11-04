import { Server } from 'socket.io';
import { User } from '../models/User.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { ClassChatMessage } from '../models/ClassChatMessage.js';
import { verifyToken } from '../utils/token.js';
import config, { isAllowedOrigin } from '../config/env.js';
import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';

let ioInstance;
const presenceCounts = new Map();
const roomName = (sessionId) => `class-session:${sessionId}`;
const presenceKey = (sessionId, userId) => `${sessionId}:${userId}`;

function publicMessage(message) {
  return {
    id: message._id.toString(),
    userId: message.user.toString(),
    name: message.name,
    role: message.role,
    body: message.removedAt ? '[Message removed by a teacher]' : message.body,
    pinned: Boolean(message.pinned),
    removed: Boolean(message.removedAt),
    createdAt: message.createdAt,
  };
}

async function assertSessionAccess(session, user) {
  if (!session || session.status !== 'live') throw new Error('This class is no longer live.');
  const item = await LearningClass.findById(session.learningClass).select('teacher teachers students');
  if (!item) throw new Error('Class not found.');
  const allowed = user.role === 'owner'
    || item.teacher.toString() === user._id.toString()
    || item.teachers.some((teacher) => teacher.toString() === user._id.toString())
    || item.students.some((student) => student.toString() === user._id.toString());
  if (!allowed) throw new Error('You are not enrolled in this class.');
  return item;
}

async function openAttendance(sessionId, user) {
  const now = new Date();
  const session = await LiveSession.findOne({ _id: sessionId, status: 'live', 'attendance.user': user._id });
  if (session) {
    const prior = session.attendance.find((record) => record.user.toString() === user._id.toString());
    const recoveredSeconds = prior && !prior.lastLeftAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(prior.lastJoinedAt).getTime()) / 1000))
      : 0;
    await LiveSession.updateOne(
      { _id: sessionId, status: 'live', 'attendance.user': user._id },
      {
        $set: { 'attendance.$.lastJoinedAt': now, 'attendance.$.lastLeftAt': null },
        $inc: { 'attendance.$.joinCount': 1, 'attendance.$.totalSeconds': recoveredSeconds },
      }
    );
  } else {
    await LiveSession.updateOne(
      { _id: sessionId, status: 'live', 'attendance.user': { $ne: user._id } },
      { $push: { attendance: { user: user._id, name: user.name, role: user.role === 'student' ? 'student' : 'teacher', firstJoinedAt: now, lastJoinedAt: now, joinCount: 1, totalSeconds: 0 } } }
    );
  }
}

async function closeAttendance(sessionId, userId) {
  const now = new Date();
  const session = await LiveSession.findOne({ _id: sessionId, status: 'live', 'attendance.user': userId }).lean();
  const record = session?.attendance?.find((item) => item.user.toString() === userId);
  if (!record || record.lastLeftAt) return;
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(record.lastJoinedAt).getTime()) / 1000));
  await LiveSession.updateOne(
    { _id: sessionId, status: 'live', 'attendance.user': userId },
    { $set: { 'attendance.$.lastLeftAt': now }, $inc: { 'attendance.$.totalSeconds': seconds } }
  );
}

async function leaveRoom(socket) {
  const { sessionId, user } = socket.data;
  if (!sessionId || !user) return;
  socket.data.sessionId = null;
  const room = roomName(sessionId);
  ioInstance?.to(room).emit('room:peer-left', { socketId: socket.id });
  await socket.leave(room);
  const key = presenceKey(sessionId, user._id.toString());
  const remaining = Math.max(0, (presenceCounts.get(key) || 1) - 1);
  if (remaining) presenceCounts.set(key, remaining);
  else {
    presenceCounts.delete(key);
    await closeAttendance(sessionId, user._id.toString());
  }
}

export function initializeClassRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true },
    maxHttpBufferSize: 1e6,
  });
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub);
      if (!user?.isActive || !['owner', 'teacher', 'student'].includes(user.role)) {
        return next(new Error('This account cannot join live classes'));
      }
      if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
        return next(new Error('Session expired. Sign in again.'));
      }
      socket.data.user = { _id: user._id.toString(), name: user.name, role: user.role };
      next();
    } catch {
      next(new Error('Session expired or invalid'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('room:join', async ({ sessionId } = {}, acknowledge = () => {}) => {
      try {
        if (socket.data.sessionId) await leaveRoom(socket);
        if (typeof sessionId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(sessionId)) {
          return acknowledge({ ok: false, message: 'Invalid class session.' });
        }
        const session = await LiveSession.findById(sessionId);
        await assertSessionAccess(session, user);
        const room = roomName(sessionId);
        const peers = (await io.in(room).fetchSockets()).map((peer) => ({
          socketId: peer.id,
          userId: peer.data.user._id,
          name: peer.data.user.name,
          role: peer.data.user.role,
        }));
        socket.data.sessionId = sessionId;
        await socket.join(room);
        const key = presenceKey(sessionId, user._id);
        const count = presenceCounts.get(key) || 0;
        presenceCounts.set(key, count + 1);
        if (count === 0) await openAttendance(sessionId, user);
        const messages = await ClassChatMessage.find({ session: sessionId }).sort({ createdAt: -1 }).limit(100).lean();
        socket.to(room).emit('room:peer-joined', { socketId: socket.id, userId: user._id, name: user.name, role: user.role });
        acknowledge({ ok: true, peers, messages: messages.reverse().map(publicMessage) });
      } catch (error) {
        if (socket.data.sessionId) await leaveRoom(socket).catch(() => {});
        acknowledge({ ok: false, message: error.message || 'Could not join the class.' });
      }
    });

    socket.on('rtc:signal', (payload = {}) => {
      const sessionId = socket.data.sessionId;
      const target = payload.target;
      if (!sessionId || typeof target !== 'string' || !payload.signal) return;
      const recipient = io.sockets.sockets.get(target);
      if (!recipient || !recipient.rooms.has(roomName(sessionId))) return;
      recipient.emit('rtc:signal', { from: socket.id, signal: payload.signal });
    });

    socket.on('screen-share:request', async ({ studentId } = {}, acknowledge = () => {}) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(String(studentId || ''))) {
        return acknowledge({ ok: false, message: 'Select a valid student in this live class.' });
      }
      try {
        const session = await LiveSession.findOne({ _id: sessionId, status: 'live' });
        const classItem = await assertSessionAccess(session, user);
        const teacherIds = [classItem.teacher, ...(classItem.teachers || [])].map(String);
        if (user.role !== 'owner' && !teacherIds.includes(user._id)) {
          return acknowledge({ ok: false, message: 'Only the assigned teacher or an admin can request student screen sharing.' });
        }
        if (!classItem.students.some((id) => id.toString() === studentId)) {
          return acknowledge({ ok: false, message: 'That participant is not an enrolled student in this class.' });
        }
        if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
          return acknowledge({ ok: false, message: 'LiveKit is not configured, so screen sharing is unavailable.' });
        }
        const room = roomName(sessionId);
        const peers = await io.in(room).fetchSockets();
        const studentSockets = peers.filter((peer) => peer.data.user?._id === studentId);
        if (!studentSockets.length) {
          return acknowledge({ ok: false, message: 'The student must join the live class before screen sharing can be requested.' });
        }
        const allowed = await LiveSession.updateOne(
          { _id: sessionId, status: 'live' },
          { $addToSet: { screenShareAllowed: studentId } },
        );
        if (!allowed.matchedCount) return acknowledge({ ok: false, message: 'This class has ended.' });
        try {
          const roomService = new RoomServiceClient(config.livekit.url, config.livekit.apiKey, config.livekit.apiSecret);
          await roomService.updateParticipant(`quicklink-${sessionId}`, studentId, {
            permission: {
              canPublish: true,
              canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
            },
          });
        } catch (error) {
          await LiveSession.updateOne({ _id: sessionId }, { $pull: { screenShareAllowed: studentId } });
          throw error;
        }
        for (const studentSocket of studentSockets) {
          studentSocket.emit('screen-share:requested', { requestedBy: user.name });
        }
        acknowledge({ ok: true, studentId });
      } catch (error) {
        acknowledge({ ok: false, message: error.message || 'Could not request screen sharing.' });
      }
    });

    socket.on('chat:send', async ({ body } = {}, acknowledge = () => {}) => {
      const sessionId = socket.data.sessionId;
      const cleanBody = String(body || '').trim().slice(0, 2000);
      if (!sessionId || !cleanBody) return acknowledge({ ok: false, message: 'Write a message first.' });
      if (Date.now() - (socket.data.lastChatAt || 0) < 350) return acknowledge({ ok: false, message: 'Please wait a moment before sending another message.' });
      try {
        const session = await LiveSession.findById(sessionId);
        if (!session || session.status !== 'live') return acknowledge({ ok: false, message: 'This class has ended.' });
        const message = await ClassChatMessage.create({ session: sessionId, user: user._id, name: user.name, role: user.role, body: cleanBody });
        socket.data.lastChatAt = Date.now();
        const result = publicMessage(message);
        io.to(roomName(sessionId)).emit('chat:message', result);
        acknowledge({ ok: true, message: result });
      } catch {
        acknowledge({ ok: false, message: 'Message could not be sent.' });
      }
    });

    socket.on('chat:pin', async ({ messageId, pinned } = {}, acknowledge = () => {}) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(String(messageId || ''))) return acknowledge({ ok: false, message: 'Invalid message.' });
      try {
        const session = await LiveSession.findById(sessionId);
        if (!session || session.status !== 'live') return acknowledge({ ok: false, message: 'This class has ended.' });
        const classItem = session && await LearningClass.findById(session.learningClass).select('teacher teachers');
        const teacherIds = classItem ? [classItem.teacher, ...(classItem.teachers || [])].map(String) : [];
        if (user.role !== 'owner' && !teacherIds.includes(user._id)) return acknowledge({ ok: false, message: 'Only a teacher can pin class messages.' });
        const message = await ClassChatMessage.findOneAndUpdate(
          { _id: messageId, session: sessionId, removedAt: null },
          { $set: { pinned: Boolean(pinned), pinnedBy: pinned ? user._id : null } },
          { new: true }
        );
        if (!message) return acknowledge({ ok: false, message: 'Message not found.' });
        const result = publicMessage(message);
        io.to(roomName(sessionId)).emit('chat:updated', result);
        acknowledge({ ok: true, message: result });
      } catch { acknowledge({ ok: false, message: 'Could not update the message.' }); }
    });

    socket.on('chat:remove', async ({ messageId } = {}, acknowledge = () => {}) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !/^[0-9a-fA-F]{24}$/.test(String(messageId || ''))) return acknowledge({ ok: false, message: 'Invalid message.' });
      try {
        const session = await LiveSession.findById(sessionId);
        if (!session || session.status !== 'live') return acknowledge({ ok: false, message: 'This class has ended.' });
        const classItem = session && await LearningClass.findById(session.learningClass).select('teacher teachers');
        const teacherIds = classItem ? [classItem.teacher, ...(classItem.teachers || [])].map(String) : [];
        if (user.role !== 'owner' && !teacherIds.includes(user._id)) return acknowledge({ ok: false, message: 'Only a teacher can remove class messages.' });
        const message = await ClassChatMessage.findOneAndUpdate({ _id: messageId, session: sessionId, removedAt: null }, { $set: { removedAt: new Date(), removedBy: user._id, body: '' } }, { new: true });
        if (!message) return acknowledge({ ok: false, message: 'Message not found.' });
        io.to(roomName(sessionId)).emit('chat:updated', publicMessage(message));
        acknowledge({ ok: true });
      } catch { acknowledge({ ok: false, message: 'Could not remove the message.' }); }
    });

    socket.on('chat:report', async ({ messageId, reason } = {}, acknowledge = () => {}) => {
      const sessionId = socket.data.sessionId;
      const cleanReason = String(reason || '').trim().slice(0, 500);
      if (!sessionId || user.role !== 'student' || !cleanReason || !/^[0-9a-fA-F]{24}$/.test(String(messageId || ''))) {
        return acknowledge({ ok: false, message: 'A valid report reason is required.' });
      }
      try {
        const session = await LiveSession.findOne({ _id: sessionId, status: 'live' });
        if (!session) return acknowledge({ ok: false, message: 'This class has ended.' });
        const message = await ClassChatMessage.findOneAndUpdate(
          { _id: messageId, session: sessionId, user: { $ne: user._id }, 'reports.user': { $ne: user._id }, removedAt: null },
          { $push: { reports: { user: user._id, reason: cleanReason, createdAt: new Date() } } },
          { new: true }
        );
        if (!message) return acknowledge({ ok: false, message: 'Message not found or already reported.' });
        io.to(roomName(sessionId)).emit('chat:reported', { messageId: message._id.toString() });
        acknowledge({ ok: true });
      } catch { acknowledge({ ok: false, message: 'Could not report this message.' }); }
    });

    socket.on('room:leave', () => { leaveRoom(socket).catch(() => {}); });
    socket.on('disconnect', () => { leaveRoom(socket).catch(() => {}); });
  });
  return io;
}

export function emitClassSessionEnded(sessionId) {
  ioInstance?.to(roomName(sessionId)).emit('session:ended');
}

export default initializeClassRealtime;
