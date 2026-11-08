import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { PlatformSetting } from '../models/PlatformSetting.js';

export const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  assessment: {
    questionCount: 10,
    passMark: 80,
    attempts: 3,
    lockdown: true,
    minimumAttendanceSessions: 2,
  },
  payment: {
    enabled: false,
    freeDays: 2,
    amount: 0,
    currency: 'RWF',
    paymentCode: '699655',
    paymentName: 'Jean Claude',
    instructions: 'Pay using the provided mobile money code, then submit the transaction reference for verification.',
  },
  certificates: {
    issuer: 'QuickLink',
    portalName: 'QuickLink Learning Portal',
    batchLimit: 20,
  },
});

// Kept for compatibility with older services that only need assessment values.
export const DEFAULT_LEARNING_SETTINGS = Object.freeze({
  bookCompletionThreshold: 95,
  assessmentQuestionCount: 10,
  assessmentPassMark: 80,
  assessmentAttempts: 3,
});

const SETTINGS_KEY = 'platform';
const CACHE_MS = 30_000;
let cached = null;
let cachedAt = 0;

const integer = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const text = (value, fallback, max = 2000) => {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, max);
};
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

function sanitize(input = {}) {
  const source = typeof input === 'object' && input ? input : {};
  const assessment = source.assessment || {};
  const payment = source.payment || {};
  const certificates = source.certificates || {};
  return {
    assessment: {
      questionCount: 10,
      passMark: integer(assessment.passMark, 1, 100, DEFAULT_PLATFORM_SETTINGS.assessment.passMark),
      attempts: integer(assessment.attempts, 1, 10, DEFAULT_PLATFORM_SETTINGS.assessment.attempts),
      lockdown: bool(assessment.lockdown, DEFAULT_PLATFORM_SETTINGS.assessment.lockdown),
      minimumAttendanceSessions: integer(assessment.minimumAttendanceSessions, 0, 100, DEFAULT_PLATFORM_SETTINGS.assessment.minimumAttendanceSessions),
    },
    payment: {
      enabled: bool(payment.enabled, DEFAULT_PLATFORM_SETTINGS.payment.enabled),
      freeDays: integer(payment.freeDays, 0, 60, DEFAULT_PLATFORM_SETTINGS.payment.freeDays),
      amount: integer(payment.amount, 0, 100000000, DEFAULT_PLATFORM_SETTINGS.payment.amount),
      currency: text(payment.currency, DEFAULT_PLATFORM_SETTINGS.payment.currency, 12),
      paymentCode: text(payment.paymentCode, DEFAULT_PLATFORM_SETTINGS.payment.paymentCode, 40),
      paymentName: text(payment.paymentName, DEFAULT_PLATFORM_SETTINGS.payment.paymentName, 120),
      instructions: text(payment.instructions, DEFAULT_PLATFORM_SETTINGS.payment.instructions),
    },
    certificates: {
      issuer: text(certificates.issuer, DEFAULT_PLATFORM_SETTINGS.certificates.issuer, 120),
      portalName: text(certificates.portalName, DEFAULT_PLATFORM_SETTINGS.certificates.portalName, 120),
      batchLimit: 20,
    },
  };
}

export async function getPlatformSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (mongoose.connection.readyState !== 1) return sanitize({});
  const record = await PlatformSetting.findOne({ key: SETTINGS_KEY }).lean();
  cached = sanitize(record?.value || {});
  cachedAt = Date.now();
  return cached;
}

function mergeSettings(current, input = {}) {
  return {
    assessment: { ...current.assessment, ...(input.assessment || {}) },
    payment: { ...current.payment, ...(input.payment || {}) },
    certificates: { ...current.certificates, ...(input.certificates || {}) },
  };
}

export async function updatePlatformSettings(input, user) {
  const current = await getPlatformSettings({ fresh: true });
  const value = sanitize(mergeSettings(current, input));
  if (input.assessment?.passMark !== undefined && value.assessment.passMark !== Number(input.assessment.passMark)) {
    throw ApiError.badRequest('Pass mark must be a whole number between 1 and 100.');
  }
  if (input.assessment?.attempts !== undefined && value.assessment.attempts !== Number(input.assessment.attempts)) {
    throw ApiError.badRequest('Attempts must be a whole number between 1 and 10 (one first attempt plus up to nine retakes).');
  }
  if (input.payment?.freeDays !== undefined && value.payment.freeDays !== Number(input.payment.freeDays)) {
    throw ApiError.badRequest('Free days must be a whole number between 0 and 60.');
  }
  if (input.payment?.amount !== undefined && value.payment.amount !== Number(input.payment.amount)) {
    throw ApiError.badRequest('Payment amount must be a whole number of at least 0.');
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

export async function getLearningSettings(options = {}) {
  const settings = await getPlatformSettings(options);
  return {
    bookCompletionThreshold: 95,
    assessmentQuestionCount: 10,
    assessmentPassMark: settings.assessment.passMark,
    assessmentAttempts: settings.assessment.attempts,
  };
}

export async function updateLearningSettings(input, user) {
  const result = await updatePlatformSettings({
    assessment: {
      passMark: input.assessmentPassMark,
      attempts: input.assessmentAttempts,
    },
  }, user);
  return {
    bookCompletionThreshold: 95,
    assessmentQuestionCount: 10,
    assessmentPassMark: result.assessment.passMark,
    assessmentAttempts: result.assessment.attempts,
  };
}

export function clearLearningSettingsCache() {
  cached = null;
  cachedAt = 0;
}

export default { getPlatformSettings, updatePlatformSettings, getLearningSettings, updateLearningSettings, DEFAULT_PLATFORM_SETTINGS };
