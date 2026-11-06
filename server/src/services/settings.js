import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { PlatformSetting } from '../models/PlatformSetting.js';

export const DEFAULT_LEARNING_SETTINGS = Object.freeze({
  bookCompletionThreshold: 95,
  assessmentQuestionCount: 10,
  assessmentPassMark: 80,
  assessmentAttempts: 3,
});

const SETTINGS_KEY = 'learning';
const CACHE_MS = 30_000;
let cached = null;
let cachedAt = 0;

function sanitize(input = {}) {
  const merged = { ...DEFAULT_LEARNING_SETTINGS };
  const integer = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
  };
  merged.bookCompletionThreshold = integer(input.bookCompletionThreshold, 50, 100, DEFAULT_LEARNING_SETTINGS.bookCompletionThreshold);
  merged.assessmentQuestionCount = integer(input.assessmentQuestionCount, 1, 50, DEFAULT_LEARNING_SETTINGS.assessmentQuestionCount);
  merged.assessmentPassMark = integer(input.assessmentPassMark, 1, 100, DEFAULT_LEARNING_SETTINGS.assessmentPassMark);
  merged.assessmentAttempts = integer(input.assessmentAttempts, 1, 20, DEFAULT_LEARNING_SETTINGS.assessmentAttempts);
  return merged;
}

export async function getLearningSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (mongoose.connection.readyState !== 1) return { ...DEFAULT_LEARNING_SETTINGS };
  const record = await PlatformSetting.findOne({ key: SETTINGS_KEY }).lean();
  cached = sanitize(record?.value || {});
  cachedAt = Date.now();
  return cached;
}

export async function updateLearningSettings(input, user) {
  const current = await getLearningSettings({ fresh: true });
  const value = sanitize({ ...current, ...input });
  if (input.bookCompletionThreshold !== undefined && value.bookCompletionThreshold !== Number(input.bookCompletionThreshold)) {
    throw ApiError.badRequest('Completion threshold must be a whole number between 50 and 100.');
  }
  if (input.assessmentQuestionCount !== undefined && value.assessmentQuestionCount !== Number(input.assessmentQuestionCount)) {
    throw ApiError.badRequest('Assessment question count must be a whole number between 1 and 50.');
  }
  if (input.assessmentPassMark !== undefined && value.assessmentPassMark !== Number(input.assessmentPassMark)) {
    throw ApiError.badRequest('Pass mark must be a whole number between 1 and 100.');
  }
  if (input.assessmentAttempts !== undefined && value.assessmentAttempts !== Number(input.assessmentAttempts)) {
    throw ApiError.badRequest('Attempt limit must be a whole number between 1 and 20.');
  }
  await PlatformSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { value, updatedBy: user?._id || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  cached = value;
  cachedAt = Date.now();
  return value;
}

export function clearLearningSettingsCache() {
  cached = null;
  cachedAt = 0;
}

export default { getLearningSettings, updateLearningSettings, DEFAULT_LEARNING_SETTINGS };
