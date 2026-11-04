import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import config from '../config/env.js';
import { LearningClass } from '../models/LearningClass.js';
import { LiveSession } from '../models/LiveSession.js';
import { TrainingRegistration } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { deleteCloudinaryAsset, uploadCloudinaryBuffer, validateCloudinaryConfig } from '../services/cloudinary.js';

const IMAGE_ROOT = path.resolve(config.registrationImageDir || fileURLToPath(new URL('../../registration-images/', import.meta.url)));
const imageTypes = [
  { ext: 'png', mime: 'image/png', matches: (buffer) => buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: 'jpg', mime: 'image/jpeg', matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', matches: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
];

const publicImageUrl = (form) => form.imageUrl || (form.imageFile ? `/api/registrations/public/${form.slug}/image` : '');
const normalizeEmail = (email) => String(email).trim().toLowerCase();
const safeForm = (form) => ({
  id: form._id.toString(),
  classId: form.learningClass?._id?.toString() || form.learningClass.toString(),
  classTitle: form.learningClass?.title || '',
  title: form.title,
  description: form.description,
  slug: form.slug,
  publicUrl: `/training-registration/${form.slug}`,
  imageUrl: publicImageUrl(form),
  placeholders: form.placeholders,
  fields: form.fields,
  active: form.active,
  createdAt: form.createdAt,
});

function assertPlaceholders(placeholders = {}) {
  return {
    name: placeholders.name?.trim() || 'Your full name',
    email: placeholders.email?.trim() || 'you@example.com',
    whatsapp: placeholders.whatsapp?.trim() || '+27 00 000 0000',
  };
}

function validateAnswers(fields, values = {}) {
  const allowedKeys = new Set(fields.map((field) => field.key));
  const answers = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.has(key)) continue;
    const text = String(value).trim();
    if (text.length > 2000) throw ApiError.badRequest(`The answer for ${fields.find((field) => field.key === key).label} is too long.`);
    answers[key] = text;
  }
  for (const field of fields) {
    if (field.required && !answers[field.key]) throw ApiError.badRequest(`${field.label} is required.`);
  }
  return answers;
}

export const listForms = asyncHandler(async (_req, res) => {
  const forms = await TrainingRegistrationForm.find().populate('learningClass', 'title active published').sort({ updatedAt: -1 }).lean();
  const formIds = forms.map((form) => form._id);
  const counts = await TrainingRegistration.aggregate([
    { $match: { form: { $in: formIds } } },
    { $group: { _id: '$form', count: { $sum: 1 } } },
  ]);
  const countByForm = new Map(counts.map((item) => [item._id.toString(), item.count]));
  res.json({ success: true, data: { forms: forms.map((form) => ({ ...safeForm(form), registrationCount: countByForm.get(form._id.toString()) || 0, classActive: form.learningClass?.active ?? false })) } });
});

export const createForm = asyncHandler(async (req, res) => {
  const classItem = await LearningClass.findOne({ _id: req.body.classId, active: true });
  if (!classItem) throw ApiError.notFound('Choose an active training class.');
  if (await TrainingRegistrationForm.exists({ learningClass: classItem._id })) {
    throw ApiError.conflict('This training already has a registration form.');
  }
  const form = await TrainingRegistrationForm.create({
    learningClass: classItem._id,
    slug: randomBytes(24).toString('base64url'),
    title: req.body.title || classItem.course || classItem.title,
    description: req.body.description || '',
    placeholders: assertPlaceholders(req.body.placeholders),
    fields: req.body.fields || [],
  });
  res.status(201).json({ success: true, data: { form: safeForm(form) } });
});

export const updateFormStatus = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findByIdAndUpdate(req.params.formId, { $set: { active: req.body.active } }, { new: true });
  if (!form) throw ApiError.notFound('Registration form not found.');
  res.json({ success: true, data: { form: safeForm(form) } });
});

export const uploadFormImage = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP image.');
  const type = imageTypes.find((image) => image.mime === req.file.mimetype && image.matches(req.file.buffer));
  if (!type) throw ApiError.badRequest('Image content must match a PNG, JPEG, or WebP file.');
  const form = await TrainingRegistrationForm.findById(req.params.formId);
  if (!form) throw ApiError.notFound('Registration form not found.');
  const previousFile = form.imageFile;
  const previousPublicId = form.imagePublicId;
  let uploaded;
  let localPath;
  if (validateCloudinaryConfig()) {
    uploaded = await uploadCloudinaryBuffer({
      buffer: req.file.buffer,
      folder: `${config.cloudinary.folderPrefix}/registration-forms`,
      resourceType: 'image',
    });
    form.imageFile = '';
    form.imagePublicId = uploaded.publicId;
    form.imageUrl = uploaded.secureUrl;
  } else {
    await fs.mkdir(IMAGE_ROOT, { recursive: true });
    const fileName = `${randomUUID()}.${type.ext}`;
    localPath = path.join(IMAGE_ROOT, fileName);
    await fs.writeFile(localPath, req.file.buffer, { flag: 'wx', mode: 0o640 });
    form.imageFile = fileName;
    form.imagePublicId = '';
    form.imageUrl = '';
  }
  try { await form.save(); }
  catch (error) {
    if (localPath) await fs.unlink(localPath).catch(() => {});
    if (uploaded?.publicId) await deleteCloudinaryAsset({ publicId: uploaded.publicId, resourceType: 'image' }).catch((cleanupError) => console.warn('[storage] Could not remove unreferenced registration image from Cloudinary:', cleanupError.message));
    throw error;
  }
  if (previousFile) await fs.unlink(path.join(IMAGE_ROOT, path.basename(previousFile))).catch(() => {});
  if (previousPublicId) await deleteCloudinaryAsset({ publicId: previousPublicId, resourceType: 'image' }).catch((error) => console.warn('[storage] Could not remove replaced registration image from Cloudinary:', error.message));
  res.json({ success: true, data: { imageUrl: publicImageUrl(form) } });
});

export const getPublicImage = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findOne({ slug: req.params.slug, active: true }).select('imageFile imageUrl learningClass').populate('learningClass', 'active');
  if (!form?.learningClass?.active || (!form.imageFile && !form.imageUrl)) throw ApiError.notFound('Registration image not found.');
  if (form.imageUrl) return res.redirect(302, form.imageUrl);
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(form.imageFile)) throw ApiError.notFound('Registration image not found.');
  let buffer;
  try { buffer = await fs.readFile(path.join(IMAGE_ROOT, form.imageFile)); }
  catch (error) { if (error.code === 'ENOENT') throw ApiError.notFound('Registration image not found.'); throw error; }
  const type = imageTypes.find((image) => image.matches(buffer));
  if (!type) throw ApiError.notFound('Registration image is invalid.');
  res.setHeader('Content-Type', type.mime);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export const getPublicForm = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findOne({ slug: req.params.slug, active: true }).populate('learningClass', 'title course subject active');
  if (!form?.learningClass?.active) throw ApiError.notFound('This registration form is unavailable.');
  res.json({ success: true, data: { form: { title: form.title, description: form.description, training: form.learningClass.course || form.learningClass.title, subject: form.learningClass.subject, imageUrl: publicImageUrl(form), placeholders: form.placeholders, fields: form.fields } } });
});

export const submitRegistration = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findOne({ slug: req.params.slug, active: true }).populate('learningClass', 'active');
  if (!form?.learningClass?.active) throw ApiError.notFound('This registration form is unavailable.');
  const answers = validateAnswers(form.fields, req.body.answers);
  try {
    const registration = await TrainingRegistration.create({
      form: form._id,
      name: req.body.name.trim(),
      email: normalizeEmail(req.body.email),
      whatsapp: req.body.whatsapp.trim(),
      answers,
    });
    res.status(201).json({ success: true, data: { registration: { name: registration.name, email: registration.email } } });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('This email address has already registered for this training.');
    throw error;
  }
});

export const listRegistrations = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findById(req.params.formId).populate('learningClass', 'title course active');
  if (!form) throw ApiError.notFound('Registration form not found.');
  const registrations = await TrainingRegistration.find({ form: form._id }).sort({ createdAt: -1 }).limit(2000).lean();
  res.json({ success: true, data: { form: safeForm(form), registrations: registrations.map((entry) => ({ id: entry._id.toString(), name: entry.name, email: entry.email, whatsapp: entry.whatsapp, answers: entry.answers instanceof Map ? Object.fromEntries(entry.answers) : entry.answers || {}, createdAt: entry.createdAt })) } });
});

export const sendLiveClassEmail = asyncHandler(async (req, res) => {
  const form = await TrainingRegistrationForm.findById(req.params.formId).populate('learningClass', 'title course subject level startsAt timezone schedule durationMinutes');
  if (!form?.learningClass) throw ApiError.notFound('Registration form or training not found.');
  const registration = await TrainingRegistration.findOne({ _id: req.params.registrationId, form: form._id });
  if (!registration) throw ApiError.notFound('Registration not found.');
  const session = await LiveSession.findOne({ learningClass: form.learningClass._id, status: 'live' });
  if (!session) throw ApiError.conflict('Start the live class before sending invitations.');
  if (!config.mail.smtpUrl || !config.mail.from || !config.mail.appUrl) {
    throw ApiError.conflict('Email invitations are not configured. Set SMTP_URL, MAIL_FROM, and APP_URL.');
  }
  const joinUrl = new URL(`/classes/join/${session.sessionCode}`, config.mail.appUrl).toString();
  const trainingName = form.learningClass.course || form.learningClass.title;
  const subject = `Live class invitation: ${trainingName}`;
  const text = `Hello ${registration.name},\n\nYour live class for ${trainingName} is ready.\n\nJoin: ${joinUrl}\n\nSign in with an enrolled QuickLink student account to join the class.`;
  try {
    const transport = nodemailer.createTransport(config.mail.smtpUrl);
    await transport.sendMail({
      from: config.mail.from,
      to: registration.email,
      subject,
      text,
      html: `<p>Hello ${escapeHtml(registration.name)},</p><p>Your live class for ${escapeHtml(trainingName)} is ready.</p><p><a href="${escapeHtml(joinUrl)}">Join the live class</a></p><p>Sign in with an enrolled QuickLink student account to join.</p>`,
    });
  } catch {
    throw ApiError.conflict('The invitation email could not be sent. Check the email service configuration.');
  }
  res.json({ success: true, data: { sent: true, email: registration.email } });
});

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export default { listForms, createForm, updateFormStatus, uploadFormImage, getPublicImage, getPublicForm, submitRegistration, listRegistrations, sendLiveClassEmail };
