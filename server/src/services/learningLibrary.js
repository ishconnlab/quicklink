import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { LearningBook } from '../models/LearningBook.js';
import { inspectDocument } from './documentFormats.js';

const DEFAULT_ROOT = fileURLToPath(new URL('../books/', import.meta.url));
export const BOOK_ROOT = path.resolve(config.learning.booksDir || DEFAULT_ROOT);
const TITLE_PREFIX = /^[A-Za-z0-9_-]{5,}\s+/;
const safeLevels = new Set(['L3', 'L4', 'L5']);

export async function listDocuments(dir = BOOK_ROOT, root = true) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) {
    if (root && error.code === 'ENOENT') return { files: [], rootExists: false, complete: false };
    if (error.code === 'ENOENT') return { files: [], rootExists: true, complete: false };
    console.warn(`[learning] Could not scan library directory ${path.relative(BOOK_ROOT, dir)}: ${error.message}`);
    return { files: [], rootExists: !root, complete: false };
  }
  const files = [];
  let complete = true;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listDocuments(fullPath, false);
      files.push(...nested.files);
      complete = complete && nested.complete;
    }
    else if (entry.isFile()) {
      const format = path.extname(entry.name).slice(1).toLowerCase();
      if (config.learning.supportedFormats.includes(format)) files.push(fullPath);
    }
  }
  return { files, rootExists: true, complete };
}

export function bookMetadataFromPath(fullPath) {
  const relative = path.relative(BOOK_ROOT, fullPath).split(path.sep).join('/');
  const parts = relative.split('/');
  const level = parts[0]?.toUpperCase();
  if (!safeLevels.has(level)) return null;
  const fileName = parts.at(-1);
  const format = path.extname(fileName).slice(1).toLowerCase();
  const title = path.basename(fileName, path.extname(fileName)).replace(TITLE_PREFIX, '').replace(/\s+/g, ' ').trim();
  return { relative, level, fileName, format, title: title || fileName, category: parts.length > 2 ? parts[1] : 'General' };
}

export async function syncLearningBooks({ force = false } = {}) {
  if (!force && Date.now() - lastSyncAt < 30000) return lastSyncResult;
  if (activeSync) return activeSync;
  activeSync = syncFromDisk();
  try {
    lastSyncResult = await activeSync;
    lastSyncAt = Date.now();
    return lastSyncResult;
  } finally { activeSync = null; }
}

let activeSync;
let lastSyncAt = 0;
let lastSyncResult = { scanned: 0, imported: 0, errors: [] };

async function syncFromDisk() {
  const { files, rootExists, complete } = await listDocuments();
  const seen = [];
  let imported = 0;
  const errors = [];
  const metadataByPath = files.map(bookMetadataFromPath).filter(Boolean);
  const existingBooks = await LearningBook.find({ sourceKey: { $in: metadataByPath.map((item) => item.relative) } })
    .select('sourceKey size fileModifiedAt format processingStatus').lean();
  const existingByPath = new Map(existingBooks.map((book) => [book.sourceKey, book]));
  for (const fullPath of files) {
    const metadata = bookMetadataFromPath(fullPath);
    if (!metadata) continue;
    seen.push(metadata.relative);
    let stat;
    let detected;
    try {
      stat = await fs.stat(fullPath);
      if (stat.size > config.learning.maxFileBytes) throw new Error(`File exceeds the ${config.learning.maxFileBytes}-byte processing limit.`);
      const existing = existingByPath.get(metadata.relative);
      if (existing?.processingStatus === 'ready' && existing.size === stat.size && existing.format === metadata.format && existing.fileModifiedAt && new Date(existing.fileModifiedAt).getTime() === Math.trunc(stat.mtimeMs)) {
        imported += 1;
        continue;
      }
      const buffer = await fs.readFile(fullPath);
      detected = await inspectDocument(buffer, metadata.fileName);
    } catch (error) {
      const message = String(error?.message || 'Document validation failed').slice(0, 500);
      errors.push({ sourceKey: metadata.relative, message });
      console.warn(`[learning] Skipped invalid document ${metadata.relative}: ${message}`);
      if (error.code === 'ENOENT') {
        await LearningBook.updateOne({ sourceKey: metadata.relative }, { $set: { processingStatus: 'missing', processingError: 'Source file disappeared during catalog refresh.' } });
        continue;
      }
      try {
        stat ||= await fs.stat(fullPath);
        await LearningBook.updateOne(
          { sourceKey: metadata.relative },
          {
            $setOnInsert: { sourceKey: metadata.relative, title: metadata.title, category: metadata.category, level: metadata.level, fileName: metadata.fileName, description: '' },
            $set: { size: stat.size, fileModifiedAt: new Date(stat.mtimeMs), format: metadata.format, mimeType: '', processingStatus: 'error', processingError: message },
          },
          { upsert: true }
        );
      } catch (catalogError) {
        if (catalogError.code === 'ENOENT') {
          await LearningBook.updateOne({ sourceKey: metadata.relative }, { $set: { processingStatus: 'missing', processingError: 'Source file disappeared during catalog refresh.' } });
          continue;
        }
        if (catalogError.code !== 11000) throw catalogError;
      }
      continue;
    }
    await LearningBook.updateOne(
      { sourceKey: metadata.relative },
      {
        $setOnInsert: { sourceKey: metadata.relative, title: detected.metadata?.title || metadata.title, category: metadata.category, level: metadata.level, fileName: metadata.fileName, description: detected.metadata?.description || '' },
        $set: { lastSeenAt: new Date(), size: stat.size, fileModifiedAt: new Date(stat.mtimeMs), format: detected.format, mimeType: detected.mimeType, processingStatus: 'ready', processingError: '' },
      },
      { upsert: true }
    );
    imported += 1;
  }
  if (rootExists && complete) await LearningBook.updateMany({ sourceKey: { $nin: seen } }, { $set: { processingStatus: 'missing', processingError: 'Source file is missing from the learning library.' } });
  return { scanned: files.length, imported, errors };
}

export function resolveBookFile(sourceKey) {
  if (typeof sourceKey !== 'string' || !sourceKey) return null;
  const fullPath = path.resolve(BOOK_ROOT, sourceKey);
  const relative = path.relative(BOOK_ROOT, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

export function safeStorageName(name) {
  const base = path.basename(String(name || 'document')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim();
  return base.slice(-180) || `document-${randomUUID()}`;
}

export async function storeUploadedBook({ buffer, originalName, level, category, mimeType }) {
  const metadata = await inspectDocument(buffer, originalName, mimeType);
  if (!config.learning.supportedFormats.includes(metadata.format)) throw ApiError.badRequest(`The .${metadata.format} format is disabled on this server.`);
  const subjectDirectory = safeStorageName(category).replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/^\.+$/, '') || 'General';
  const fileName = safeStorageName(originalName);
  const targetDirectory = path.join(BOOK_ROOT, level, subjectDirectory);
  await fs.mkdir(targetDirectory, { recursive: true });
  const storedName = `${randomUUID()}-${fileName}`;
  const fullPath = path.join(targetDirectory, storedName);
  await fs.writeFile(fullPath, buffer, { flag: 'wx', mode: 0o640 });
  const sourceKey = path.relative(BOOK_ROOT, fullPath).split(path.sep).join('/');
  try {
    const book = await LearningBook.create({
      sourceKey, title: path.basename(fileName, path.extname(fileName)).slice(0, 240), category: subjectDirectory,
      description: '', level, fileName, format: metadata.format, mimeType: metadata.mimeType, size: buffer.length,
      active: false, processingStatus: 'ready', processingError: '', lastSeenAt: new Date(), fileModifiedAt: (await fs.stat(fullPath)).mtime,
    });
    return book;
  } catch (error) {
    await fs.unlink(fullPath).catch(() => {});
    throw error;
  }
}

export async function replaceBookFile(book, { buffer, originalName, mimeType }) {
  const detected = await inspectDocument(buffer, originalName, mimeType);
  if (!config.learning.supportedFormats.includes(detected.format)) throw ApiError.badRequest(`The .${detected.format} format is disabled on this server.`);
  if (detected.format !== book.format) throw ApiError.badRequest(`Replacement format must remain .${book.format}.`);
  const currentPath = resolveBookFile(book.sourceKey);
  if (!currentPath) throw new Error('Stored book path is invalid.');
  const rootReal = await fs.realpath(BOOK_ROOT);
  const currentReal = await fs.realpath(currentPath).catch(() => null);
  if (currentReal && !currentReal.startsWith(`${rootReal}${path.sep}`)) throw new Error('Stored book path escapes the learning library.');
  const stagedPath = path.join(path.dirname(currentPath), `.replacement-${randomUUID()}`);
  const backupPath = path.join(path.dirname(currentPath), `.backup-${randomUUID()}`);
  await fs.writeFile(stagedPath, buffer, { flag: 'wx', mode: 0o640 });
  let backedUp = false;
  try {
    await fs.rename(currentPath, backupPath);
    backedUp = true;
    await fs.rename(stagedPath, currentPath);
  } catch (error) {
    if (backedUp) await fs.rename(backupPath, currentPath).catch(() => {});
    await fs.unlink(stagedPath).catch(() => {});
    throw error;
  }
  book.fileName = safeStorageName(originalName);
  book.mimeType = detected.mimeType;
  book.size = buffer.length;
  book.fileModifiedAt = new Date();
  book.processingStatus = 'ready';
  book.processingError = '';
  try {
    await book.save();
    await fs.unlink(backupPath).catch(() => {});
  } catch (error) {
    await fs.unlink(currentPath).catch(() => {});
    if (backedUp) await fs.rename(backupPath, currentPath).catch(() => {});
    throw error;
  }
  return book;
}

export async function deleteBookFile(sourceKey) {
  const fullPath = resolveBookFile(sourceKey);
  if (!fullPath) throw new Error('Stored book path is invalid.');
  const rootReal = await fs.realpath(BOOK_ROOT);
  const fileReal = await fs.realpath(fullPath);
  if (!fileReal.startsWith(`${rootReal}${path.sep}`)) throw new Error('Stored book path escapes the learning library.');
  await fs.unlink(fileReal);
}

export default { syncLearningBooks, resolveBookFile, storeUploadedBook, replaceBookFile, deleteBookFile };
