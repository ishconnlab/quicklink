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
import { TrainingRegistration, REGISTRATION_STATUSES, normalizedEmail, normalizedPhone } from '../models/TrainingRegistration.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import { User } from '../models/User.js';
import { deleteCloudinaryAsset, uploadCloudinaryBuffer } from '../services/cloudinary.js';
import { assertCanManageClass, isAdmin } from '../security/roles.js';
import { recordActivity } from '../services/activityLog.js';

const IMAGE_ROOT = path.resolve(config.registrationImageDir || fileURLToPath(new URL('../../registration-images/', import.meta.url)));
const imageTypes = [
  { ext: 'png', mime: 'image/png', matches: (buffer) => buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { ext: 'jpg', mime: 'image/jpeg', matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', matches: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
];

const TRANSITIONS = {
  PENDING: ['APPROVED', 'REJECTED', 'ENROLLED'],
  APPROVED: ['PENDING', 'REJECTED', 'ENROLLED'],
  REJECTED: ['PENDING', 'APPROVED'],
  ENROLLED: ['INVITED', 'ATTENDED', 'COMPLETED'],
  INVITED: ['ENROLLED', 'ATTENDED', 'COMPLETED'],
  ATTENDED: ['COMPLETED'],
  COMPLETED: [],
};

const publicImageUrl = (form) => form.imageUrl || (form.imageFile ? `/api/registrations/public/${form.slug}/image` : '');
const safeForm = (form) => ({
  id: form._id.toString(),
  classId: form.learningClass?._id?.toString() || form.learningClass.toString(),
  classTitle: form.learningClass?.title || '',
  classActive: form.learningClass?.active ?? false,
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

const safeRegistration = (entry) => ({
  id: entry._id.toString(),
  name: entry.name,
  email: entry.email,
  whatsapp: entry.whatsapp,
  answers: entry.answers instanceof Map ? Object.fromEntries(entry.answers) : entry.answers || {},
  status: entry.status || 'PENDING',
  studentId: entry.student?._id?.toString() || entry.student?.toString() || null,
  reviewedAt: entry.reviewedAt || null,
  enrolledAt: entry.enrolledAt || null,
  invitedAt: entry.invitedAt || null,
  completedAt: entry.completedAt || null,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
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

export function statusTransition(registration, status, user, note = '') {
  if (!REGISTRATION_STATUSES.includes(status)) throw ApiError.badRequest('Choose a valid registration status.');
  const current = registration.status || 'PENDING';
  if (current === status) return false;
  if (!isAdmin(user) && !(TRANSITIONS[current] || []).includes(status)) {
    throw ApiError.conflict(`A registration cannot move from ${current} to ${status}.`);
  }
  registration.status = status;
  registration.statusHistory.push({ status, by: user?._id || null, note: String(note || '').slice(0, 1000) });
  if (status === 'APPROVED') {
    registration.reviewedBy = user?._id || null;
    registration.reviewedAt = new Date();
  }
  if (status === 'REJECTED') {
    registration.reviewedBy = user?._id || null;
    registration.reviewedAt = new Date();
  }
  if (status === 'ENROLLED') registration.enrolledAt = registration.enrolledAt || new Date();
  if (status === 'INVITED') registration.invitedAt = new Date();
  if (status === 'COMPLETED') registration.completedAt = new Date();
  return true;
}

async function manageableClassIds(user) {
  if (isAdmin(user)) return null;
  return LearningClass.find({ $or: [{ teacher: user._id }, { teachers: user._id }] }).distinct('_id');
}

async function formWithClass(formId, user) {
  const form = await TrainingRegistrationForm.findById(formId).populate('learningClass', 'title course subject active published teacher teachers students maxStudents enrollmentOpen');
  if (!form) throw ApiError.notFound('Registration form not found.');
  assertCanManageClass(user, form.learningClass);
  return form;
}

async function registrationFor(form, registrationId) {
  const registration = await TrainingRegistration.findOne({ _id: registrationId, form: form._id });
  if (!registration) throw ApiError.notFound('Registration not found.');
  return registration;
}

function temporaryPassword() {
  return `${randomBytes(9).toString('base64url')}Aa1!`;
}

async function sendEnrollmentEmail({ student, learningClass, temporaryPassword: password }) {
  if (!config.mail.smtpUrl || !config.mail.from || !config.mail.appUrl) return false;
  const signInUrl = new URL('/login', config.mail.appUrl).toString();
  const classUrl = new URL(`/classes/${learningClass._id}`, config.mail.appUrl).toString();
  const trainingName = learningClass.course || learningClass.title;
  const credentials = password ? `\nEmail: ${student.email}\nTemporary password: ${password}\n` : '';
  const text = `Hello ${student.name},\n\nYou have been enrolled in ${trainingName} at QuickLink.${credentials}\nSign in: ${signInUrl}\nClass: ${classUrl}\n\nPlease keep these details private.`;
  try {
    const transport = nodemailer.createTransport(config.mail.smtpUrl);
    await transport.sendMail({
      from: config.mail.from,
      to: student.email,
      subject: `QuickLink enrollment: ${trainingName}`,
      text,
      html: `<p>Hello ${escapeHtml(student.name)},</p><p>You have been enrolled in <strong>${escapeHtml(trainingName)}</strong> at QuickLink.</p>${password ? `<p>Email: ${escapeHtml(student.email)}<br>Temporary password: <strong>${escapeHtml(password)}</strong></p>` : ''}<p><a href="${escapeHtml(signInUrl)}">Sign in to QuickLink</a></p><p><a href="${escapeHtml(classUrl)}">Open your class</a></p><p>Please keep these details private.</p>`,
    });
    return true;
  } catch {
    return false;
  }
}

async function enrollRegistration(form, registration, req) {
  const learningClass = await LearningClass.findById(form.learningClass._id || form.learningClass);
  if (!learningClass) throw ApiError.notFound('Training class not found.');
  if (!learningClass.active) throw ApiError.conflict('This class is archived.');
  const email = normalizedEmail(registration.email);
  let student = await User.findOne({ email });
  let created = false;
  let password = '';
  if (student && student.role !== 'student') throw ApiError.conflict('This email belongs to a staff account and cannot be enrolled as a student.');
  if (!student) {
    password = temporaryPassword();
    student = new User({
      name: registration.name,
      email,
      role: 'student',
      registrationStatus: 'approved',
      isActive: true,
    });
    await student.setPassword(password);
    try {
      await student.save();
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      student = await User.findOne({ email });
      password = '';
      if (!student || student.role !== 'student') throw ApiError.conflict('A student account with this email could not be linked.');
      created = false;
    }
  }
  if (!student.isActive) {
    student.isActive = true;
    student.registrationStatus = 'approved';
    student.tokenVersion += 1;
    await student.save();
  }
  const alreadyEnrolled = learningClass.students.some((id) => id.toString() === student._id.toString());
  if (!alreadyEnrolled && learningClass.students.length >= (learningClass.maxStudents || 300)) {
    throw ApiError.conflict('This class has reached its enrollment capacity.');
  }
  if (!alreadyEnrolled) await LearningClass.updateOne({ _id: learningClass._id }, { $addToSet: { students: student._id } });
  registration.student = student._id;
  statusTransition(registration, 'ENROLLED', req.user, 'Registration approved and student enrolled.');
  await registration.save();
  const emailSent = await sendEnrollmentEmail({ student, learningClass, temporaryPassword: created ? password : '' });
  return {
    registration: safeRegistration(registration),
    student: student.toSafeJSON(),
    created,
    emailSent,
    temporaryPassword: created && !emailSent ? password : null,
  };
}

export const listForms = asyncHandler(async (req, res) => {
  const classIds = await manageableClassIds(req.user);
  const forms = await TrainingRegistrationForm.find(classIds === null ? {} : { learningClass: { $in: classIds } })
    .populate('learningClass', 'title active published')
    .sort({ updatedAt: -1 })
    .lean();
  const formIds = forms.map((form) => form._id);
  const counts = await TrainingRegistration.aggregate([
    { $match: { form: { $in: formIds } } },
    { $group: { _id: { form: '$form', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const countByForm = new Map();
  for (const item of counts) {
    const key = item._id.form.toString();
    const status = item._id.status || 'PENDING';
    const countsForForm = countByForm.get(key) || { total: 0, pending: 0 };
    countsForForm.total += item.count;
    if (status === 'PENDING') countsForForm.pending += item.count;
    countByForm.set(key, countsForForm);
  }
  res.json({ success: true, data: { forms: forms.map((form) => ({
    ...safeForm(form),
    registrationCount: countByForm.get(form._id.toString())?.total || 0,
    pendingCount: countByForm.get(form._id.toString())?.pending || 0,
    classActive: form.learningClass?.active ?? false,
  })) } });
});

export const createForm = asyncHandler(async (req, res) => {
  const classItem = await LearningClass.findOne({ _id: req.body.classId, active: true });
  if (!classItem) throw ApiError.notFound('Choose an active training class.');
  assertCanManageClass(req.user, classItem);
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
  res.status(201).json({ success: true, data: { form: safeForm({ ...form.toObject(), learningClass: classItem }) } });
});

export const updateFormStatus = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  form.active = req.body.active;
  await form.save();
  res.json({ success: true, data: { form: safeForm(form) } });
});

export const uploadFormImage = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Choose a PNG, JPEG, or WebP image.');
  const type = imageTypes.find((image) => image.mime === req.file.mimetype && image.matches(req.file.buffer));
  if (!type) throw ApiError.badRequest('Image content must match a PNG, JPEG, or WebP file.');
  const form = await formWithClass(req.params.formId, req.user);
  const previousFile = form.imageFile;
  const previousPublicId = form.imagePublicId;
  let uploaded;
  let localPath;
  if (config.cloudinary.enabled) {
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
  if (previousPublicId && config.cloudinary.enabled) await deleteCloudinaryAsset({ publicId: previousPublicId, resourceType: 'image' }).catch((error) => console.warn('[storage] Could not remove replaced registration image from Cloudinary:', error.message));
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
  const email = normalizedEmail(req.body.email);
  const phone = normalizedPhone(req.body.whatsapp);
  const duplicate = await TrainingRegistration.findOne({
    form: form._id,
    $or: [{ normalizedEmail: email }, { email }, { normalizedPhone: phone }],
  }).select('_id').lean();
  if (duplicate) throw ApiError.conflict('These contact details have already been registered for this training.');
  try {
    const registration = await TrainingRegistration.create({
      form: form._id,
      name: req.body.name.trim(),
      email,
      whatsapp: req.body.whatsapp.trim(),
      answers,
      status: 'PENDING',
      statusHistory: [{ status: 'PENDING', at: new Date(), note: 'Registration submitted.' }],
    });
    res.status(201).json({ success: true, data: { registration: { name: registration.name, email: registration.email, status: registration.status } } });
  } catch (error) {
    if (error?.code === 11000) throw ApiError.conflict('This email address has already registered for this training.');
    throw error;
  }
});

export const listRegistrations = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const filter = { form: form._id };
  if (req.query.status) filter.status = req.query.status;
  const registrations = await TrainingRegistration.find(filter)
    .populate('student', 'name email isActive')
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();
  res.json({ success: true, data: { form: safeForm(form), registrations: registrations.map(safeRegistration) } });
});

export const reviewRegistration = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const registration = await registrationFor(form, req.params.registrationId);
  statusTransition(registration, req.body.status, req.user, req.body.note);
  await registration.save();
  await recordActivity(req, { action: 'registration.status_changed', resourceType: 'registration', resourceId: registration._id, message: `Registration for ${registration.email} set to ${registration.status}.` });
  res.json({ success: true, data: { registration: safeRegistration(registration) } });
});

export const enrollRegistrationStudent = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const registration = await registrationFor(form, req.params.registrationId);
  if (registration.status === 'REJECTED') throw ApiError.conflict('Approve this registration before enrolling the student.');
  const result = await enrollRegistration(form, registration, req);
  await recordActivity(req, { action: 'registration.enrolled', resourceType: 'registration', resourceId: registration._id, message: `Enrolled ${registration.email} as a student.` });
  res.json({ success: true, data: result });
});

export const enrollSelectedRegistrations = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const ids = [...new Set((req.body.registrationIds || []).map(String))];
  const registrations = await TrainingRegistration.find({ _id: { $in: ids }, form: form._id });
  if (registrations.length !== ids.length) throw ApiError.badRequest('One or more registrations were not found.');
  const results = [];
  for (const registration of registrations) {
    if (registration.status === 'REJECTED') {
      results.push({ registrationId: registration._id.toString(), error: 'Rejected registrations cannot be enrolled.' });
      continue;
    }
    try {
      results.push({ registrationId: registration._id.toString(), ...(await enrollRegistration(form, registration, req)) });
    } catch (error) {
      results.push({ registrationId: registration._id.toString(), error: error.message });
    }
  }
  res.json({ success: true, data: { results } });
});

export const sendLiveClassEmail = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const registration = await registrationFor(form, req.params.registrationId);
  if (!registration.student) throw ApiError.conflict('Enroll this student before sending a class invitation.');
  if (['PENDING', 'APPROVED', 'REJECTED'].includes(registration.status || 'PENDING')) {
    throw ApiError.conflict('Enroll this student before sending a class invitation.');
  }
  const session = await LiveSession.findOne({ learningClass: form.learningClass._id, status: 'live' });
  if (!config.mail.smtpUrl || !config.mail.from || !config.mail.appUrl) {
    throw ApiError.conflict('Email invitations are not configured. Set SMTP_URL, MAIL_FROM, and APP_URL.');
  }
  const target = session
    ? new URL(`/classes/join/${session.sessionCode}`, config.mail.appUrl).toString()
    : new URL(`/classes/${form.learningClass._id}`, config.mail.appUrl).toString();
  const trainingName = form.learningClass.course || form.learningClass.title;
  const subject = `QuickLink class invitation: ${trainingName}`;
  const text = `Hello ${registration.name},\n\nYou are invited to your QuickLink class for ${trainingName}.\n\n${session ? 'The live class is starting now. Join here' : 'Open your class here'}: ${target}\n\nSign in with your registered QuickLink student account.`;
  try {
    const transport = nodemailer.createTransport(config.mail.smtpUrl);
    await transport.sendMail({
      from: config.mail.from,
      to: registration.email,
      subject,
      text,
      html: `<p>Hello ${escapeHtml(registration.name)},</p><p>You are invited to your QuickLink class for <strong>${escapeHtml(trainingName)}</strong>.</p><p><a href="${escapeHtml(target)}">${session ? 'Join the live class' : 'Open your class'}</a></p><p>Sign in with your registered QuickLink student account.</p>`,
    });
  } catch {
    throw ApiError.conflict('The invitation email could not be sent. Check the email service configuration.');
  }
  if (registration.status === 'ENROLLED') statusTransition(registration, 'INVITED', req.user, 'Class invitation sent.');
  registration.invitedAt = new Date();
  await registration.save();
  res.json({ success: true, data: { sent: true, email: registration.email, live: Boolean(session) } });
});

export const sendClassInvitations = asyncHandler(async (req, res) => {
  const form = await formWithClass(req.params.formId, req.user);
  const filter = { form: form._id, student: { $ne: null }, status: { $in: ['ENROLLED', 'INVITED', 'ATTENDED', 'COMPLETED'] } };
  if (Array.isArray(req.body.registrationIds) && req.body.registrationIds.length) {
    filter._id = { $in: [...new Set(req.body.registrationIds.map(String))] };
  }
  const registrations = await TrainingRegistration.find(filter);
  if (!registrations.length) throw ApiError.conflict('There are no enrolled students to invite.');
  const results = [];
  for (const registration of registrations) {
    try {
      const session = await LiveSession.findOne({ learningClass: form.learningClass._id, status: 'live' });
      if (!config.mail.smtpUrl || !config.mail.from || !config.mail.appUrl) throw new Error('Email service is not configured.');
      const target = session
        ? new URL(`/classes/join/${session.sessionCode}`, config.mail.appUrl).toString()
        : new URL(`/classes/${form.learningClass._id}`, config.mail.appUrl).toString();
      const trainingName = form.learningClass.course || form.learningClass.title;
      const transport = nodemailer.createTransport(config.mail.smtpUrl);
      await transport.sendMail({
        from: config.mail.from,
        to: registration.email,
        subject: `QuickLink class invitation: ${trainingName}`,
        text: `Hello ${registration.name},\n\nYour QuickLink class for ${trainingName} is ready.\n\n${session ? 'Join the live class' : 'Open your class'}: ${target}\n\nSign in with your registered student account.`,
      });
      if (registration.status === 'ENROLLED') statusTransition(registration, 'INVITED', req.user, 'Class invitation sent.');
      registration.invitedAt = new Date();
      await registration.save();
      results.push({ registrationId: registration._id.toString(), sent: true, email: registration.email });
    } catch (error) {
      results.push({ registrationId: registration._id.toString(), sent: false, email: registration.email, error: error.message });
    }
  }
  res.json({ success: true, data: { results, sent: results.filter((row) => row.sent).length, failed: results.filter((row) => !row.sent).length } });
});

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export default {
  listForms,
  createForm,
  updateFormStatus,
  uploadFormImage,
  getPublicImage,
  getPublicForm,
  submitRegistration,
  listRegistrations,
  reviewRegistration,
  enrollRegistrationStudent,
  enrollSelectedRegistrations,
  sendLiveClassEmail,
  sendClassInvitations,
};

