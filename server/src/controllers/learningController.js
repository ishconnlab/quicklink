import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import config from '../config/env.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningBook } from '../models/LearningBook.js';
import { LearningProgress } from '../models/LearningProgress.js';
import { LearningClass } from '../models/LearningClass.js';
import { LearningAssessmentAttempt } from '../models/LearningAssessmentAttempt.js';
import { formatAwareProgress } from '../services/learningProgress.js';
import { gradeAssessment, sanitizeAssessmentQuestions } from '../services/finalAssessment.js';
import { getLearningSettings } from '../services/settings.js';
import { findOrIssueBookCertificate, bookCertificateJson } from '../services/bookCertificates.js';
import { inspectDocument } from '../services/documentFormats.js';
import { BOOK_ROOT, deleteBookFile, replaceBookFile, resolveBookFile, storeUploadedBook, syncLearningBooks } from '../services/learningLibrary.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const COVER_ROOT = path.resolve(process.env.BOOK_COVER_DIR || fileURLToPath(new URL('../../book-covers/', import.meta.url)));
const COVER_TYPES = [
  { ext: 'png', mime: 'image/png', valid: (buffer) => buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: 'jpg', mime: 'image/jpeg', valid: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', valid: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
];

const progressJson = (progress) => progress ? {
  currentPage: progress.currentPage, totalPages: progress.totalPages, positionType: progress.positionType,
  positionIndex: progress.positionIndex, positionLabel: progress.positionLabel,
  furthestPosition: progress.furthestPosition, totalUnits: progress.totalUnits,
  progressPercent: progress.progressPercent, scrollPercent: progress.scrollPercent || 0, timeSpentSeconds: progress.timeSpentSeconds, completed: progress.completed,
  lastReadAt: progress.lastReadAt, lastOpenedAt: progress.lastOpenedAt,
} : null;

const bookJson = (book, progress) => ({
  id: book._id.toString(), title: book.title, description: book.description, category: book.category, level: book.level,
  fileName: book.fileName, format: book.format, mimeType: book.mimeType, size: book.size, active: book.active,
  coverUrl: book.coverFile ? `/learning/books/${book._id}/cover` : '',
  processingStatus: book.processingStatus, processingError: book.processingError,
  progress: progressJson(progress),
});

async function readableBook(req) {
  const book = await LearningBook.findOne({ _id: req.params.id, ...(req.user.role === 'admin' ? {} : { active: true }) });
  if (!book) throw ApiError.notFound('This document is unavailable');
  if (book.processingStatus === 'error') throw ApiError.conflict(`This document failed validation: ${book.processingError || 'retry catalog processing'}`);
  const fullPath = resolveBookFile(book.sourceKey);
  if (!fullPath) throw ApiError.notFound('Document file not found');
  let rootReal;
  try { rootReal = await fs.realpath(BOOK_ROOT); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Learning library storage is unavailable.'); throw error; }
  let fullReal;
  try { fullReal = await fs.realpath(fullPath); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Document file not found'); throw error; }
  if (!fullReal.startsWith(`${rootReal}${path.sep}`)) throw ApiError.forbidden('Document path is outside the learning library.');
  const buffer = await fs.readFile(fullReal);
  const detected = await inspectDocument(buffer, book.fileName);
  return { book, buffer, detected };
}

export const listBooks = asyncHandler(async (req, res) => {
  const sync = await syncLearningBooks();
  const owner = req.user.role === 'admin';
  const filter = {};
  if (!(owner && req.query.manage === 'true')) filter.active = true;
  if (!owner || req.query.manage !== 'true') filter.processingStatus = 'ready';
  if (req.query.level) filter.level = req.query.level;
  else if (!owner && req.user.role === 'student' && req.user.educationLevel) filter.level = req.user.educationLevel;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.format) filter.format = req.query.format;
  const search = String(req.query.search || '').trim();
  if (search) filter.$or = [{ title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { description: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { fileName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  const books = await LearningBook.find(filter).sort({ level: 1, category: 1, title: 1 }).limit(limit).lean();
  const [progress, categories] = await Promise.all([
    LearningProgress.find({ student: req.user._id, book: { $in: books.map((book) => book._id) } }).lean(),
    LearningBook.distinct('category', owner && req.query.manage === 'true' ? {} : { active: true, processingStatus: 'ready' }),
  ]);
  const progressByBook = new Map(progress.map((item) => [item.book.toString(), item]));
  res.json({ success: true, data: { books: books.map((book) => bookJson(book, progressByBook.get(book._id.toString()))), levels: ['L3', 'L4', 'L5'], categories: categories.sort(), formats: [...new Set(books.map((book) => book.format))].sort(), supportedFormats: config.learning.supportedFormats, maxFileBytes: config.learning.maxFileBytes, sync } });
});

export const saveProgress = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Only student accounts can save learning progress.');
  const book = await LearningBook.findOne({ _id: req.params.id, active: true, processingStatus: 'ready' });
  if (!book) throw ApiError.notFound('This document is unavailable');
  const existing = await LearningProgress.findOne({ student: req.user._id, book: book._id }).lean();
  const settings = await getLearningSettings();
  const progress = await LearningProgress.findOneAndUpdate(
    { student: req.user._id, book: book._id },
    { $set: formatAwareProgress(book.format, req.body, new Date(), existing, { completionThreshold: settings.bookCompletionThreshold }) },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.json({ success: true, data: { progress: progressJson(progress) } });
});

export const getBookAssessment = asyncHandler(async (req, res) => {
  const book = await LearningBook.findById(req.params.id).select('title assessmentQuestions').lean();
  if (!book) throw ApiError.notFound('Learning document not found.');
  res.json({ success: true, data: { title: book.title, questions: book.assessmentQuestions || [] } });
});

export const saveBookAssessment = asyncHandler(async (req, res) => {
  const book = await LearningBook.findById(req.params.id).select('assessmentQuestions');
  if (!book) throw ApiError.notFound('Learning document not found.');
  const settings = await getLearningSettings();
  if (req.body.questions.length && req.body.questions.length !== settings.assessmentQuestionCount) {
    throw ApiError.badRequest(`This assessment must contain exactly ${settings.assessmentQuestionCount} questions. Change the assessment settings to use a different count.`);
  }
  const changed = JSON.stringify(book.assessmentQuestions.map((question) => question.toObject())) !== JSON.stringify(req.body.questions);
  if (changed && await LearningAssessmentAttempt.exists({ book: book._id })) {
    throw ApiError.conflict('This assessment cannot be changed after students have attempted it.');
  }
  book.assessmentQuestions = req.body.questions;
  await book.save();
  res.json({ success: true, data: { configured: book.assessmentQuestions.length > 0, questionCount: book.assessmentQuestions.length } });
});

async function getRequiredAssessmentContext(bookId, studentId) {
  const [book, settings] = await Promise.all([
    LearningBook.findOne({ _id: bookId, active: true, processingStatus: 'ready' })
      .select('title level assessmentQuestions')
      .lean(),
    getLearningSettings(),
  ]);
  if (!book) throw ApiError.notFound('This learning document is unavailable.');
  const courses = await LearningClass.find({
    students: studentId,
    active: true,
    learningMaterials: book._id,
    'completionRequirements.requireReading': true,
  }).select('title').lean();
  const progress = await LearningProgress.findOne({ student: studentId, book: book._id }).select('completed progressPercent').lean();
  const attempts = await LearningAssessmentAttempt.find({ student: studentId, book: book._id })
    .sort({ attemptNumber: 1 })
    .select('attemptNumber score passed violation submittedAt')
    .lean();
  return {
    book,
    courses,
    settings,
    readingCompleted: Boolean(progress?.completed),
    attempts,
    configured: (book.assessmentQuestions || []).length > 0,
  };
}

function shuffledSafeQuestions(questions) {
  const safe = sanitizeAssessmentQuestions(questions);
  for (let index = safe.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [safe[index], safe[swapIndex]] = [safe[swapIndex], safe[index]];
  }
  return safe;
}

export const getFinalAssessment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Final assessments are for student accounts.');
  const state = await getRequiredAssessmentContext(req.params.id, req.user._id);
  const attemptsRemaining = Math.max(0, state.settings.assessmentAttempts - state.attempts.length);
  const latest = state.attempts.at(-1) || null;
  const passed = state.attempts.some((attempt) => attempt.passed);
  const canStart = state.readingCompleted && state.configured && !passed && attemptsRemaining > 0;
  const certificate = passed ? await findOrIssueBookCertificate(state.book, req.user) : null;
  res.json({
    success: true,
    data: {
      bookTitle: state.book.title,
      courseTitles: state.courses.map((course) => course.title),
      required: state.courses.length > 0,
      configured: state.configured,
      questionCount: state.book.assessmentQuestions?.length || 0,
      passMark: state.settings.assessmentPassMark,
      attemptLimit: state.settings.assessmentAttempts,
      readingCompleted: state.readingCompleted,
      passed,
      attemptsUsed: state.attempts.length,
      attemptsRemaining,
      latestAttempt: latest ? { score: latest.score, passed: latest.passed, submittedAt: latest.submittedAt } : null,
      certificate: bookCertificateJson(certificate),
      questions: canStart ? shuffledSafeQuestions(state.book.assessmentQuestions) : [],
    },
  });
});

export const submitFinalAssessment = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Final assessments are for student accounts.');
  const state = await getRequiredAssessmentContext(req.params.id, req.user._id);
  if (!state.readingCompleted) throw ApiError.conflict('Finish reading this document before taking its assessment.');
  if (!state.configured) throw ApiError.conflict('The administrator has not configured an assessment for this document.');
  if (state.attempts.some((attempt) => attempt.passed)) throw ApiError.conflict('You have already passed this assessment.');
  const attemptNumber = state.attempts.length + 1;
  if (attemptNumber > state.settings.assessmentAttempts) throw ApiError.conflict('No assessment attempts remain. Contact your administrator.');
  const { answers, violation = '' } = req.body;
  if (!violation && answers.length !== state.book.assessmentQuestions.length) {
    throw ApiError.badRequest(`Answer all ${state.book.assessmentQuestions.length} questions before submitting.`);
  }
  const { score, passed } = gradeAssessment(state.book.assessmentQuestions, answers, state.settings.assessmentPassMark);
  let attempt;
  try {
    attempt = await LearningAssessmentAttempt.create({
      student: req.user._id,
      book: state.book._id,
      attemptNumber,
      answers,
      score,
      passed,
      violation,
    });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('An assessment attempt was submitted at the same time. Refresh the assessment status.');
    throw error;
  }
  const certificate = passed ? await findOrIssueBookCertificate(state.book, req.user) : null;
  res.status(201).json({
    success: true,
    data: {
      score,
      passed,
      attemptNumber: attempt.attemptNumber,
      attemptsRemaining: Math.max(0, state.settings.assessmentAttempts - attemptNumber),
      passMark: state.settings.assessmentPassMark,
      violationRecorded: Boolean(violation),
      reportToAdministrator: Boolean(violation),
      certificate: bookCertificateJson(certificate),
    },
  });
});

export const getBookCertificate = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') throw ApiError.forbidden('Book certificates are for student accounts.');
  const book = await LearningBook.findOne({ _id: req.params.id, active: true }).select('title level').lean();
  if (!book) throw ApiError.notFound('This learning document is unavailable.');
  const passed = await LearningAssessmentAttempt.exists({ student: req.user._id, book: book._id, passed: true });
  if (!passed) throw ApiError.conflict('Pass this document assessment to earn its certificate.');
  const certificate = await findOrIssueBookCertificate(book, req.user);
  res.json({ success: true, data: { certificate: bookCertificateJson(certificate) } });
});
export const listBookAssessmentAttempts = asyncHandler(async (req, res) => {
  const attempts = await LearningAssessmentAttempt.find({ book: req.params.id })
    .populate('student', 'name email')
    .sort({ submittedAt: -1 })
    .limit(100)
    .lean();
  res.json({
    success: true,
    data: {
      attempts: attempts.map((attempt) => ({
        id: attempt._id.toString(),
        studentName: attempt.student?.name || 'Deleted student',
        studentEmail: attempt.student?.email || '',
        attemptNumber: attempt.attemptNumber,
        score: attempt.score,
        passed: attempt.passed,
        violation: attempt.violation,
        submittedAt: attempt.submittedAt,
      })),
    },
  });
});

export const streamBook = asyncHandler(async (req, res) => {
  const { book, buffer, detected } = await readableBook(req);
  const disposition = detected.format === 'pdf' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', detected.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(book.fileName)}`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.end(buffer);
});

function xmlText(xml) {
  return [...xml.matchAll(/<(?:[A-Za-z0-9]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?t>/g)]
    .map((match) => decodeXml(match[1]).trim())
    .filter(Boolean);
}

export function sanitizeGeneratedHtml(html) {
  const allowed = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'br', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'a']);
  return html.replace(/<\/?([a-z][a-z0-9]*)(?:\s[^<>]*?)?\s*\/?>/gi, (tag, name) => {
    const normalized = name.toLowerCase();
    if (!allowed.has(normalized)) return '';
    const closing = /^<\//.test(tag);
    return normalized === 'br' ? '<br>' : `<${closing ? '/' : ''}${normalized}>`;
  });
}

function decodeXml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()];
  });
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export async function spreadsheetPreview(buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  const stringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = stringsXml ? [...stringsXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]).join('')) : [];
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string') || '';
  const names = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)].slice(0, 20);
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') || '';
  const relationships = new Map([...relsXml.matchAll(/<Relationship\b(?=[^>]*\bId="([^"]+)")(?=[^>]*\bTarget="([^"]+)")[^>]*\/?\s*>/g)].map((match) => [match[1], match[2]]));
  const sheets = [];
  for (let sheetIndex = 0; sheetIndex < names.length; sheetIndex += 1) {
    const [, rawName, relationId] = names[sheetIndex];
    const target = relationships.get(relationId);
    const file = target && zip.file(target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
    if (!file) continue;
    const xml = await file.async('string');
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const reference = cellMatch[1].match(/\br="([A-Z]+\d+)"/i)?.[1] || 'A1';
        const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1];
        const value = cellMatch[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
        const inline = cellMatch[2].match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/)?.[1];
        const raw = type === 's' && value !== undefined ? sharedStrings[Number(value)] || '' : inline !== undefined ? xmlText(inline).join('') : decodeXml(value || '');
        row[columnIndex(reference)] = String(raw).slice(0, 500);
      }
      if (row.length) rows.push(Array.from({ length: Math.min(row.length, 30) }, (_, index) => row[index] ?? ''));
      if (rows.length >= 100) break;
    }
    sheets.push({ name: decodeXml(rawName), rows });
  }
  return sheets;
}

export const previewBook = asyncHandler(async (req, res) => {
  const { book, buffer, detected } = await readableBook(req);
  let preview;
  if (detected.format === 'pdf') preview = { kind: 'pdf' };
  else if (detected.format === 'txt' || detected.format === 'md') {
    const text = buffer.toString('utf8');
    const totalUnits = detected.format === 'md' ? Math.max(1, (text.match(/^#{1,6}\s/gm) || []).length) : Math.max(1, text.split(/\n\s*\n/).filter(Boolean).length);
    preview = { kind: detected.format === 'md' ? 'markdown' : 'text', content: text.slice(0, 300000), truncated: text.length > 300000, totalUnits };
  } else if (detected.format === 'docx') {
    let value;
    try { ({ value } = await mammoth.convertToHtml({ buffer })); }
    catch { throw ApiError.badRequest('This Word document could not be converted to a safe preview. Download it to view the file.'); }
    const html = sanitizeGeneratedHtml(value);
    preview = { kind: 'html', content: html, totalUnits: Math.max(1, (html.match(/<h[1-6]>/g) || []).length) };
  } else if (detected.format === 'pptx') {
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    const items = [];
    for (const [index, name] of slides.slice(0, 200).entries()) items.push({ number: index + 1, text: xmlText(await zip.file(name).async('string')).join('\n') });
    preview = { kind: 'slides', slides: items, totalUnits: slides.length };
  } else if (detected.format === 'xlsx') {
    try { const sheets = await spreadsheetPreview(buffer); preview = { kind: 'sheets', sheets, totalUnits: sheets.length }; }
    catch { throw ApiError.badRequest('This spreadsheet could not be converted to a safe preview. Download it to view the file.'); }
  } else preview = { kind: 'download', message: `Preview is not available for .${detected.format} files. Download to open this document safely.` };
  res.json({ success: true, data: { book: bookJson(book), format: detected.format, preview } });
});

export const updateBook = asyncHandler(async (req, res) => {
  const book = await LearningBook.findById(req.params.id);
  if (!book) throw ApiError.notFound('Document not found');
  for (const field of ['title', 'description', 'category', 'level', 'active']) if (req.body[field] !== undefined) book[field] = req.body[field];
  await book.save();
  res.json({ success: true, data: { book: bookJson(book) } });
});

export const uploadBookCover = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP cover image.');
  if (req.file.size > 3 * 1024 * 1024) throw ApiError.badRequest('Book cover images must be 3 MB or smaller.');
  const type = COVER_TYPES.find((candidate) => candidate.mime === req.file.mimetype && candidate.valid(req.file.buffer));
  if (!type) throw ApiError.badRequest('Book cover content must match a PNG, JPEG, or WebP image.');
  const book = await LearningBook.findById(req.params.id);
  if (!book) throw ApiError.notFound('Document not found.');
  await fs.mkdir(COVER_ROOT, { recursive: true });
  const fileName = `${randomUUID()}.${type.ext}`;
  const coverPath = path.join(COVER_ROOT, fileName);
  await fs.writeFile(coverPath, req.file.buffer, { flag: 'wx', mode: 0o640 });
  const previous = book.coverFile;
  book.coverFile = fileName;
  try { await book.save(); }
  catch (error) { await fs.unlink(coverPath).catch(() => {}); throw error; }
  if (previous && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(previous)) await fs.unlink(path.join(COVER_ROOT, previous)).catch(() => {});
  res.json({ success: true, data: { book: bookJson(book), coverUrl: `/learning/books/${book._id}/cover` } });
});

export const streamBookCover = asyncHandler(async (req, res) => {
  const book = await LearningBook.findOne({ _id: req.params.id, ...(req.user.role === 'admin' ? {} : { active: true }) }).select('coverFile');
  if (!book?.coverFile || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(book.coverFile)) throw ApiError.notFound('Book cover not found.');
  let buffer;
  try { buffer = await fs.readFile(path.join(COVER_ROOT, book.coverFile)); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Book cover not found.'); throw error; }
  const type = COVER_TYPES.find((candidate) => candidate.valid(buffer));
  if (!type) throw ApiError.notFound('Book cover is invalid.');
  res.setHeader('Content-Type', type.mime);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export const uploadBook = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a document to upload.');
  const book = await storeUploadedBook({ buffer: req.file.buffer, originalName: req.file.originalname, level: req.body.level, category: req.body.category, mimeType: req.file.mimetype });
  res.status(201).json({ success: true, data: { book: bookJson(book), previewUrl: `/api/learning/books/${book._id}/preview` } });
});

export const replaceBook = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a replacement document.');
  const book = await LearningBook.findById(req.params.id);
  if (!book) throw ApiError.notFound('Document not found');
  const updated = await replaceBookFile(book, { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype });
  res.json({ success: true, data: { book: bookJson(updated) } });
});

export const deleteBook = asyncHandler(async (req, res) => {
  const book = await LearningBook.findById(req.params.id);
  if (!book) throw ApiError.notFound('Document not found');
  await deleteBookFile(book.sourceKey).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  if (book.coverFile && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(book.coverFile)) await fs.unlink(path.join(COVER_ROOT, book.coverFile)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  await Promise.all([LearningProgress.deleteMany({ book: book._id }), LearningBook.deleteOne({ _id: book._id })]);
  res.json({ success: true, data: { deleted: true } });
});

export const retryBook = asyncHandler(async (req, res) => {
  const book = await LearningBook.findById(req.params.id);
  if (!book) throw ApiError.notFound('Document not found');
  const fullPath = resolveBookFile(book.sourceKey);
  if (!fullPath) throw ApiError.notFound('Document file not found');
  let buffer;
  try { buffer = await fs.readFile(fullPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    book.processingStatus = 'missing';
    book.processingError = 'Source file is missing from the learning library.';
    await book.save();
    throw ApiError.notFound('Source file is missing from the learning library.');
  }
  let detected;
  try { detected = await inspectDocument(buffer, book.fileName); }
  catch (error) {
    book.processingStatus = 'error';
    book.processingError = String(error.message || 'Document validation failed').slice(0, 500);
    await book.save();
    throw error;
  }
  book.format = detected.format;
  book.mimeType = detected.mimeType;
  book.size = buffer.length;
  book.processingStatus = 'ready';
  book.processingError = '';
  book.lastSeenAt = new Date();
  await book.save();
  res.json({ success: true, data: { book: bookJson(book) } });
});

export const learningSummary = asyncHandler(async (req, res) => {
  await syncLearningBooks();
  const [totalBooks, progress] = await Promise.all([
    LearningBook.countDocuments({ active: true, processingStatus: 'ready' }),
    LearningProgress.find({ student: req.user._id }).populate('book', 'title level category format active processingStatus').sort({ lastOpenedAt: -1, lastReadAt: -1 }).limit(100).lean(),
  ]);
  const current = progress.filter((item) => item.book?.active && item.book.processingStatus === 'ready');
  res.json({ success: true, data: {
    totalBooks, booksStarted: current.length, completedBooks: current.filter((item) => item.completed).length,
    recentlyRead: current.slice(0, 6).map((item) => ({ id: item.book._id.toString(), title: item.book.title, level: item.book.level, category: item.book.category, format: item.book.format, currentPage: item.currentPage, totalPages: item.totalPages, positionType: item.positionType, positionIndex: item.positionIndex, positionLabel: item.positionLabel, progressPercent: item.progressPercent, completed: item.completed, lastReadAt: item.lastReadAt, lastOpenedAt: item.lastOpenedAt })),
  } });
});

export default { listBooks, saveProgress, getBookAssessment, saveBookAssessment, getFinalAssessment, submitFinalAssessment, getBookCertificate, listBookAssessmentAttempts, streamBook, streamBookCover, previewBook, updateBook, uploadBook, uploadBookCover, replaceBook, deleteBook, retryBook, learningSummary };




