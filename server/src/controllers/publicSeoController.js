import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { TrainingRegistrationForm } from '../models/TrainingRegistrationForm.js';
import config from '../config/env.js';

const slugPart = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'training';
export const programmeSlug = (item) => `${slugPart(item.title)}-${item._id.toString()}`;

function publicProgramme(item, form = null) {
  const classId = item._id.toString();
  return {
    id: classId,
    slug: programmeSlug(item),
    title: item.title,
    subject: item.subject,
    trade: item.trade || '',
    programme: item.course || '',
    introduction: item.introduction || '',
    description: item.description || '',
    thumbnailUrl: item.thumbnailUrl || (item.thumbnailFile ? `/api/courses/${classId}/thumbnail` : ''),
    level: item.level,
    startsAt: item.startsAt || null,
    endsAt: item.endsAt || null,
    schedule: item.schedule || '',
    durationMinutes: item.durationMinutes || null,
    enrollmentOpen: item.enrollmentOpen !== false,
    enrollmentClosesAt: item.enrollmentClosesAt || null,
    registrationUrl: form ? `/training-registration/${form.slug}` : '',
    completionRequirements: {
      requireReading: Boolean(item.completionRequirements?.requireReading),
      requireTheory: Boolean(item.completionRequirements?.requireTheory),
      requirePractical: Boolean(item.completionRequirements?.requirePractical),
      requireAttendance: Boolean(item.completionRequirements?.requireAttendance),
      minimumScore: Number(item.completionRequirements?.minimumScore || 0),
    },
    projectSubmission: {
      enabled: Boolean(item.projectSubmission?.enabled),
      required: Boolean(item.projectSubmission?.required),
      title: item.projectSubmission?.title || 'Project submission',
      instructions: item.projectSubmission?.instructions || '',
    },
    assessment: {
      enabled: Boolean(item.certificationAssessmentEnabled),
      passMark: item.assessmentPassMark ?? 80,
      minimumAttendanceSessions: item.minimumAttendanceSessions ?? 2,
    },
    courseStructuredDataEligible: Boolean(
      (item.teacher || item.teachers?.length)
      && item.students?.length
      && (item.introduction?.trim() || item.description?.trim()),
    ),
    updatedAt: item.updatedAt,
  };
}

export const listPublicProgrammes = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(60, Math.max(1, Number(req.query.limit || 24)));
  const filter = { active: true, published: { $ne: false } };
  if (req.query.search) {
    const expression = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: expression }, { subject: expression }, { trade: expression }, { course: expression }, { introduction: expression }, { description: expression }];
  }
  const [items, total] = await Promise.all([
    LearningClass.find(filter).select('title subject trade course introduction description thumbnailUrl thumbnailFile level startsAt endsAt schedule durationMinutes enrollmentOpen enrollmentClosesAt completionRequirements projectSubmission certificationAssessmentEnabled assessmentPassMark minimumAttendanceSessions teacher teachers students updatedAt').sort({ startsAt: 1, title: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    LearningClass.countDocuments(filter),
  ]);
  const forms = await TrainingRegistrationForm.find({ learningClass: { $in: items.map((item) => item._id) }, active: true }).select('learningClass slug').lean();
  const formMap = new Map(forms.map((form) => [form.learningClass.toString(), form]));
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, data: { programmes: items.map((item) => publicProgramme(item, formMap.get(item._id.toString()))), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

export const getPublicProgramme = asyncHandler(async (req, res) => {
  const id = req.params.slug.match(/-([a-f\d]{24})$/i)?.[1];
  if (!id) throw ApiError.notFound('Programme not found.');
  const item = await LearningClass.findOne({ _id: id, active: true, published: { $ne: false } }).select('title subject trade course introduction description thumbnailUrl thumbnailFile level startsAt endsAt schedule durationMinutes enrollmentOpen enrollmentClosesAt completionRequirements projectSubmission certificationAssessmentEnabled assessmentPassMark minimumAttendanceSessions teacher teachers students updatedAt').lean();
  if (!item || programmeSlug(item) !== req.params.slug) throw ApiError.notFound('Programme not found.');
  const form = await TrainingRegistrationForm.findOne({ learningClass: item._id, active: true }).select('slug').lean();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, data: { programme: publicProgramme(item, form) } });
});

export const sitemap = asyncHandler(async (_req, res) => {
  const base = (config.appUrl || 'https://quicklink.ishconnect.rw').replace(/\/$/, '');
  const fixed = [
    ['/about', 'monthly', '0.6'], ['/about-ishconnect', 'monthly', '0.5'],
    ['/programmes', 'daily', '0.9'], ['/how-learning-works', 'monthly', '0.6'], ['/resources', 'weekly', '0.7'], ['/contact', 'monthly', '0.4'],
  ];
  const courses = await LearningClass.find({ active: true, published: { $ne: false } }).select('_id title updatedAt').sort({ updatedAt: -1 }).limit(50000).lean();
  const urls = fixed.map(([path, freq, priority]) => ({ url: `${base}${path || '/'}`, freq, priority }));
  for (const item of courses) urls.push({ url: `${base}/programmes/${programmeSlug(item)}`, lastmod: item.updatedAt, freq: 'weekly', priority: '0.8' });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((entry) => `<url><loc>${entry.url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loc>${entry.lastmod ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : ''}<changefreq>${entry.freq}</changefreq><priority>${entry.priority}</priority></url>`).join('')}</urlset>`;
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(xml);
});
