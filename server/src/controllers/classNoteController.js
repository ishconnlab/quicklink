import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LiveSession } from '../models/LiveSession.js';
import { ClassSessionNote } from '../models/ClassSessionNote.js';

async function access(sessionId, user) {
  const session = await LiveSession.findById(sessionId).populate('learningClass', 'teacher teachers students');
  if (!session) throw ApiError.notFound('Class session not found');
  const item = session.learningClass;
  const teachers = [item.teacher, ...(item.teachers || [])].map((teacher) => (teacher._id || teacher).toString());
  const allowed = user.role === 'owner' || teachers.includes(user._id.toString()) || item.students.some((student) => student.toString() === user._id.toString());
  if (!allowed) throw ApiError.forbidden('You are not enrolled in this class.');
  return { session, canEdit: user.role === 'owner' || teachers.includes(user._id.toString()) };
}

export const getNotes = asyncHandler(async (req, res) => {
  const { session } = await access(req.params.sessionId, req.user);
  const note = await ClassSessionNote.findOne({ session: session._id }).lean();
  res.json({ success: true, data: { notes: note?.content || '', revision: note?.revision || 0, updatedAt: note?.updatedAt || null } });
});

export const saveNotes = asyncHandler(async (req, res) => {
  const { session, canEdit } = await access(req.params.sessionId, req.user);
  if (!canEdit) throw ApiError.forbidden('Only a teacher or admin can update shared class notes.');
  const expectedRevision = req.body.revision;
  const note = await ClassSessionNote.findOneAndUpdate(
    { session: session._id, revision: expectedRevision },
    { $set: { content: req.body.content, updatedBy: req.user._id }, $inc: { revision: 1 } },
    { new: true, runValidators: true }
  );
  if (note) return res.json({ success: true, data: { notes: note.content, revision: note.revision, updatedAt: note.updatedAt } });
  if (expectedRevision === 0 && !(await ClassSessionNote.exists({ session: session._id }))) {
    try {
      const created = await ClassSessionNote.create({ session: session._id, content: req.body.content, revision: 1, updatedBy: req.user._id });
      return res.status(201).json({ success: true, data: { notes: created.content, revision: created.revision, updatedAt: created.updatedAt } });
    } catch (error) { if (error.code !== 11000) throw error; }
  }
  const latest = await ClassSessionNote.findOne({ session: session._id }).lean();
  throw ApiError.conflict('These notes changed since you opened them. Reload the latest version before saving.', { revision: latest?.revision || 0 });
});

export default { getNotes, saveNotes };
