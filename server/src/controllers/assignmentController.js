import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { Assignment } from '../models/Assignment.js';
import { AssignmentSubmission } from '../models/AssignmentSubmission.js';
import { LearningClass } from '../models/LearningClass.js';
import { User } from '../models/User.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { notifyUsers } from '../services/notifications.js';

const teacherIdsFor = (item) => [item.teacher, ...(item.teachers || [])].filter(Boolean).map((person) => (person._id || person).toString());
const isTeacher = (item, user) => user.role === 'admin' || teacherIdsFor(item).includes(user._id.toString());
const SUBMISSION_DIR = path.resolve(process.env.SUBMISSIONS_DIR || fileURLToPath(new URL('../../private-submissions/', import.meta.url)));

function validateSubmissionFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const buffer = file.buffer;
  const images = ext === '.png' && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    ? 'image/png' : ['.jpg', '.jpeg'].includes(ext) && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      ? 'image/jpeg' : null;
  if (images) {
    if (file.mimetype !== images) throw ApiError.badRequest('Submission image MIME type does not match its file content.');
    return { ext, mimeType: images };
  }
  if (ext === '.pdf' && file.mimetype === 'application/pdf' && buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) return { ext, mimeType: 'application/pdf' };
  if (ext === '.zip' && ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype) && buffer.subarray(0, 2).toString() === 'PK') return { ext, mimeType: 'application/zip' };
  const textExt = new Set(['.txt', '.md', '.js', '.ts', '.py', '.json', '.css', '.html']);
  if (textExt.has(ext) && ['text/plain', 'text/markdown', 'application/json', 'text/javascript', 'application/octet-stream'].includes(file.mimetype)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw ApiError.badRequest('Text submission must be valid UTF-8.'); }
    if (buffer.includes(0)) throw ApiError.badRequest('Binary files cannot be submitted as source text.');
    return { ext, mimeType: 'text/plain; charset=utf-8' };
  }
  throw ApiError.badRequest('Unsupported submission file. Use PDF, PNG/JPEG, ZIP, or UTF-8 text/source files.');
}

async function storeSubmissionFiles(files = []) {
  if (files.length > 5) throw ApiError.badRequest('Attach no more than five files.');
  const stored = [];
  try {
    await fs.mkdir(SUBMISSION_DIR, { recursive: true });
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw ApiError.badRequest('Each submission file must be 10 MB or smaller.');
      const type = validateSubmissionFile(file);
      if (type.ext === '.zip') {
        let archive;
        try { archive = await JSZip.loadAsync(file.buffer, { checkCRC32: false }); }
        catch { throw ApiError.badRequest('The submitted ZIP archive is invalid.'); }
        const expanded = Object.values(archive.files).reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
        if (Object.keys(archive.files).length > 1000 || expanded > 75 * 1024 * 1024) throw ApiError.badRequest('The project archive exceeds safe preview limits.');
      }
      const key = `${randomUUID()}${type.ext}`;
      await fs.writeFile(path.join(SUBMISSION_DIR, key), file.buffer, { flag: 'wx', mode: 0o600 });
      stored.push({ originalName: path.basename(file.originalname).replace(/[\u0000-\u001f\\/]/g, '-').slice(0, 240), storageKey: key, mimeType: type.mimeType, size: file.size });
    }
    return stored;
  } catch (error) {
    await Promise.all(stored.map((file) => fs.unlink(path.join(SUBMISSION_DIR, file.storageKey)).catch(() => {})));
    throw error;
  }
}

async function assignmentAccess(assignmentId, user) {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) throw ApiError.notFound('Assignment not found');
  const item = await LearningClass.findById(assignment.learningClass).select('teacher teachers students active title');
  if (!item) throw ApiError.notFound('Class not found');
  const member = user.role === 'admin' || isTeacher(item, user) || item.students.some((id) => id.toString() === user._id.toString());
  if (!member) throw ApiError.forbidden('You are not enrolled in this class.');
  return { assignment, item, teacher: isTeacher(item, user), student: item.students.some((id) => id.toString() === user._id.toString()) };
}

function assignmentJson(item, submission, includeAnswers = false) {
  return {
    id: item._id.toString(), classId: item.learningClass.toString(), title: item.title, instructions: item.instructions,
    ...(includeAnswers && item.createdBy ? { createdBy: item.createdBy.toString() } : {}),
    type: item.type, dueAt: item.dueAt, maxPoints: item.maxPoints, allowLate: item.allowLate,
    objectives: item.objectives || '', toolsAndMaterials: item.toolsAndMaterials || '', tasks: item.tasks || [],
    submissionRequirements: item.submissionRequirements || '', submissionTypes: item.submissionTypes || [],
    rubric: item.rubric || [], passMark: item.passMark ?? 50,
    allowResubmission: item.allowResubmission, published: item.published,
    questions: (item.questions || []).map((question) => ({ id: question._id.toString(), prompt: question.prompt, type: question.type, options: question.options, points: question.points, ...(includeAnswers ? { correctOption: question.correctOption } : {}) })),
    submission: submission ? { id: submission._id.toString(), attempt: submission.attempt, response: submission.response, answers: submission.answers, links: submission.links || [], files: (submission.files || []).map(({ originalName, mimeType, size }, index) => ({ index, originalName, mimeType, size })), submittedAt: submission.submittedAt, status: submission.status, score: submission.score, feedback: submission.feedback, gradedAt: submission.gradedAt } : null,
  };
}

export const listClassAssignments = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.classId).select('teacher teachers students active');
  if (!item) throw ApiError.notFound('Class not found');
  const teacher = isTeacher(item, req.user);
  const student = item.students.some((id) => id.toString() === req.user._id.toString());
  if (req.user.role !== 'admin' && !teacher && !student) throw ApiError.forbidden('You are not enrolled in this class.');
  const filter = { learningClass: item._id, ...(teacher ? {} : { published: true }) };
  const assignments = await Assignment.find(filter).sort({ dueAt: 1, createdAt: -1 }).limit(100).lean();
  const submissions = student ? await AssignmentSubmission.find({ assignment: { $in: assignments.map((a) => a._id) }, student: req.user._id }).sort({ attempt: -1 }).lean() : [];
  const submissionCounts = teacher ? await AssignmentSubmission.aggregate([
    { $match: { assignment: { $in: assignments.map((assignment) => assignment._id) }, status: { $ne: 'draft' } } },
    { $group: { _id: '$assignment', count: { $sum: 1 }, pending: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'revision-requested']] }, 1, 0] } } } },
  ]) : [];
  const countsByAssignment = new Map(submissionCounts.map((row) => [row._id.toString(), row]));
  const latest = new Map();
  for (const submission of submissions) if (!latest.has(submission.assignment.toString())) latest.set(submission.assignment.toString(), submission);
  res.json({ success: true, data: { assignments: assignments.map((assignment) => ({ ...assignmentJson(assignment, latest.get(assignment._id.toString()), teacher), submissionCount: countsByAssignment.get(assignment._id.toString())?.count || 0, pendingCount: countsByAssignment.get(assignment._id.toString())?.pending || 0 })) } });
});

export const createAssignment = asyncHandler(async (req, res) => {
  const item = await LearningClass.findById(req.params.classId).select('teacher teachers students active title');
  if (!item) throw ApiError.notFound('Class not found');
  if (!isTeacher(item, req.user)) throw ApiError.forbidden('Only an assigned teacher or admin can create assignments.');
  if (!item.active) throw ApiError.conflict('Archived classes cannot receive assignments.');
  const totalPoints = req.body.questions?.reduce((sum, question) => sum + question.points, 0);
  if (totalPoints > req.body.maxPoints) throw ApiError.badRequest('Question points cannot exceed the assignment maximum.');
  if (req.body.passMark > req.body.maxPoints) throw ApiError.badRequest('Pass mark cannot exceed the assignment maximum.');
  const assignment = await Assignment.create({ ...req.body, learningClass: item._id, createdBy: req.user._id });
  if (assignment.published) await notifyUsers(item.students, { type: 'assignment', title: `New ${assignment.type}: ${assignment.title}`, message: item.title, href: '/assignments' });
  res.status(201).json({ success: true, data: { assignment: assignmentJson(assignment, null, true) } });
});

export const updateAssignment = asyncHandler(async (req, res) => {
  const { assignment, item, teacher } = await assignmentAccess(req.params.id, req.user);
  if (!teacher) throw ApiError.forbidden('Only an assigned teacher or admin can update assignments.');
  if (await AssignmentSubmission.exists({ assignment: assignment._id })) throw ApiError.conflict('An assignment cannot be edited after students submit work.');
  const wasPublished = assignment.published;
  Object.assign(assignment, req.body);
  const totalPoints = assignment.questions.reduce((sum, question) => sum + question.points, 0);
  if (totalPoints > assignment.maxPoints) throw ApiError.badRequest('Question points cannot exceed the assignment maximum.');
  if (assignment.passMark > assignment.maxPoints) throw ApiError.badRequest('Pass mark cannot exceed the assignment maximum.');
  const saved = await Assignment.findByIdAndUpdate(assignment._id, { $set: req.body }, { new: true, runValidators: true });
  if (!wasPublished && saved.published) await notifyUsers(item.students, { type: 'assignment', title: `New ${saved.type}: ${saved.title}`, message: item.title, href: '/assignments' });
  res.json({ success: true, data: { assignment: assignmentJson(saved, null, true) } });
});

export const deleteAssignment = asyncHandler(async (req, res) => {
  const { assignment, teacher } = await assignmentAccess(req.params.id, req.user);
  if (!teacher) throw ApiError.forbidden('Only an assigned teacher or admin can delete an assignment.');
  if (!['practical', 'assignment'].includes(assignment.type)) {
    throw ApiError.badRequest('Only practical assignments can be deleted from this page.');
  }
  if (req.user.role !== 'admin' && String(assignment.createdBy || '') !== req.user._id.toString()) {
    throw ApiError.forbidden('You can delete only practical assignments you created.');
  }

  const submissions = await AssignmentSubmission.find({ assignment: assignment._id }).select('files').lean();
  await AssignmentSubmission.deleteMany({ assignment: assignment._id });
  await Assignment.deleteOne({ _id: assignment._id });
  await Promise.all(submissions.flatMap((submission) => (submission.files || []).map(async (file) => {
    if (!file.storageKey || path.basename(file.storageKey) !== file.storageKey) return;
    try { await fs.unlink(path.join(SUBMISSION_DIR, file.storageKey)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  })));
  res.json({ success: true, data: { assignment: { id: assignment._id.toString(), deleted: true } } });
});

export const submitAssignment = asyncHandler(async (req, res) => {
  const { assignment, item, student } = await assignmentAccess(req.params.id, req.user);
  if (!student || !['student'].includes(req.user.role)) throw ApiError.forbidden('Only enrolled students can submit this assignment.');
  if (!assignment.published) throw ApiError.notFound('Assignment not found');
  if (assignment.dueAt && assignment.dueAt < new Date() && !assignment.allowLate) throw ApiError.conflict('The deadline has passed and late submissions are closed.');
  let answers = req.body.answers || [];
  let links = req.body.links || [];
  if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { throw ApiError.badRequest('Answers must be valid JSON.'); } }
  if (typeof links === 'string') { try { links = JSON.parse(links); } catch { links = [links]; } }
  if (!Array.isArray(answers) || !Array.isArray(links) || answers.length > 100 || links.length > 20) throw ApiError.badRequest('Submission fields exceed the supported limits.');
  links = links.map((link) => {
    let parsed;
    try { parsed = new URL(link); } catch { throw ApiError.badRequest('Submission links must be valid URLs.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw ApiError.badRequest('Submission links must use HTTP or HTTPS without embedded credentials.');
    return parsed.href;
  });
  const previous = await AssignmentSubmission.findOne({ assignment: assignment._id, student: req.user._id }).sort({ attempt: -1 });
  const isDraft = req.body.draft === true || req.body.draft === 'true';
  if (previous && previous.status !== 'draft' && (!assignment.allowResubmission || previous.status === 'submitted' || previous.status === 'passed')) throw ApiError.conflict('A submission already exists and resubmission is not available.');
  const validIds = new Set(assignment.questions.map((q) => q._id.toString()));
  if (answers.some((answer) => !validIds.has(answer.questionId))) throw ApiError.badRequest('Submission contains an unknown question.');
  const questionById = new Map(assignment.questions.map((question) => [question._id.toString(), question]));
  let autoScore = 0;
  let hasManual = false;
  for (const answer of answers) {
    const question = questionById.get(answer.questionId);
    if (question.type === 'single-choice') {
      if (answer.selectedOption !== undefined && answer.selectedOption >= question.options.length) throw ApiError.badRequest('Selected option is invalid.');
      if (answer.selectedOption === question.correctOption) autoScore += question.points;
    } else hasManual = true;
  }
  const storedFiles = await storeSubmissionFiles(req.files || []);
  const status = isDraft ? 'draft' : hasManual ? 'submitted' : autoScore >= assignment.passMark ? 'passed' : 'failed';
  try {
    const values = {
      response: req.body.response || '', answers, links, files: storedFiles, status,
      score: isDraft || hasManual ? null : autoScore,
      submittedAt: isDraft ? null : new Date(),
      gradedAt: isDraft || hasManual ? null : new Date(),
    };
    const submission = previous?.status === 'draft'
      ? await AssignmentSubmission.findByIdAndUpdate(previous._id, { $set: values }, { new: true, runValidators: true })
      : await AssignmentSubmission.create({ assignment: assignment._id, learningClass: item._id, student: req.user._id, attempt: (previous?.attempt || 0) + 1, ...values });
    if (previous?.status === 'draft') await Promise.all((previous.files || []).filter((file) => !storedFiles.some((next) => next.storageKey === file.storageKey)).map((file) => fs.unlink(path.join(SUBMISSION_DIR, file.storageKey)).catch(() => {})));
    if (!isDraft) {
      const admins = await User.find({ role: 'admin', isActive: true }).distinct('_id');
      await notifyUsers([...teacherIdsFor(item), ...admins], { type: 'assignment', title: 'Assignment submitted', message: `${req.user.name} submitted ${assignment.title}`, href: `/courses/${item._id}` });
    }
    res.status(201).json({ success: true, data: { submission: { id: submission._id.toString(), attempt: submission.attempt, status: submission.status, score: submission.score, submittedAt: submission.submittedAt } } });
  } catch (error) {
    await Promise.all(storedFiles.map((file) => fs.unlink(path.join(SUBMISSION_DIR, file.storageKey)).catch(() => {})));
    if (error?.code === 11000) throw ApiError.conflict('A submission was saved at the same time. Reload the assignment and retry.');
    throw error;
  }
});

export const listSubmissions = asyncHandler(async (req, res) => {
  const { assignment, item, teacher } = await assignmentAccess(req.params.id, req.user);
  if (!teacher) throw ApiError.forbidden('Only an assigned teacher or admin can view class submissions.');
  const submissions = await AssignmentSubmission.find({ assignment: assignment._id }).populate('student', 'name email').sort({ student: 1, attempt: -1 }).limit(1000).lean();
  res.json({ success: true, data: { submissions: submissions.map((submission) => ({ id: submission._id.toString(), student: { id: submission.student._id.toString(), name: submission.student.name, email: submission.student.email }, attempt: submission.attempt, response: submission.response, answers: submission.answers, links: submission.links || [], files: (submission.files || []).map(({ originalName, mimeType, size }, index) => ({ index, originalName, mimeType, size })), submittedAt: submission.submittedAt, status: submission.status, score: submission.score, feedback: submission.feedback, gradedAt: submission.gradedAt })) } });
});

export const gradeSubmission = asyncHandler(async (req, res) => {
  const submission = await AssignmentSubmission.findById(req.params.submissionId);
  if (!submission) throw ApiError.notFound('Submission not found');
  const { assignment, item, teacher } = await assignmentAccess(submission.assignment, req.user);
  if (!teacher) throw ApiError.forbidden('Only an assigned teacher or admin can grade submissions.');
  if (req.body.score > assignment.maxPoints) throw ApiError.badRequest('Score cannot exceed the assignment maximum.');
  submission.score = req.body.score;
  submission.feedback = req.body.feedback;
  const decision = req.body.decision || 'graded';
  submission.status = decision;
  submission.gradedBy = req.user._id;
  submission.gradedAt = new Date();
  submission.gradingHistory.push({ score: submission.score, feedback: submission.feedback, status: decision, gradedBy: req.user._id, gradedAt: submission.gradedAt });
  await submission.save();
  await notifyUsers([submission.student], { type: 'grade', title: `Grade posted: ${assignment.title}`, message: `${submission.score}/${assignment.maxPoints}${submission.feedback ? ` â€” ${submission.feedback}` : ''}`, href: '/assignments' });
  res.json({ success: true, data: { submission: { id: submission._id.toString(), status: submission.status, score: submission.score, feedback: submission.feedback, gradedAt: submission.gradedAt, gradingHistory: submission.gradingHistory } } });
});

export const downloadSubmissionFile = asyncHandler(async (req, res) => {
  const submission = await AssignmentSubmission.findById(req.params.submissionId);
  if (!submission) throw ApiError.notFound('Submission not found.');
  const { item, teacher, student } = await assignmentAccess(submission.assignment, req.user);
  if (!teacher && !(student && submission.student.toString() === req.user._id.toString())) throw ApiError.forbidden('You cannot access this submission file.');
  const file = submission.files[Number(req.params.fileIndex)];
  if (!file) throw ApiError.notFound('Submission file not found.');
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(file.storageKey)) throw ApiError.notFound('Submission file not found.');
  let buffer;
  try { buffer = await fs.readFile(path.join(SUBMISSION_DIR, file.storageKey)); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Submission file is no longer stored.'); throw error; }
  res.setHeader('Content-Type', file.mimeType.split(';')[0]);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.end(buffer);
});

export default { listClassAssignments, createAssignment, updateAssignment, deleteAssignment, submitAssignment, listSubmissions, gradeSubmission };
