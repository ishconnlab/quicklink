import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseLearningProgress } from '../models/CourseLearningProgress.js';
import { isAdmin } from '../security/roles.js';
import { DAILY_UNLOCK_HOUR, DEFAULT_COURSE_TIMEZONE, isLessonAccessible, nextDailyUnlockAt } from '../services/lessonAccess.js';
import { getEnrollment, paymentState } from '../services/classAccess.js';

const idString = (value) => String(value?._id || value || '');
function allLessons(course) {
  return (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ module, lesson })));
}
const completionTimesFor = (progress) => new Map((progress?.lessonCompletions || []).map((entry) => [idString(entry.lessonId), entry.completedAt]));
function markLessonCompleted(progress, lessonId, completedAt = new Date()) {
  const id = idString(lessonId);
  if (!(progress.completedLessons || []).some((entry) => idString(entry) === id)) progress.completedLessons.push(lessonId);
  if (!(progress.lessonCompletions || []).some((entry) => idString(entry.lessonId) === id)) progress.lessonCompletions.push({ lessonId, completedAt });
}
function safeCourse(course, progress, reveal = false) {
  const completed = new Set((progress?.completedLessons || []).map(idString));
  const completionTimes = completionTimesFor(progress);
  const entries = allLessons(course);
  const accessMode = course.lessonAccessMode || 'sequential';
  const timeZone = course.timezone || DEFAULT_COURSE_TIMEZONE;
  const now = new Date();
  const accessOptions = { completionTimes, timeZone, unlockHour: DAILY_UNLOCK_HOUR };
  let lessonIndex = 0;
  const modules = (course.modules || []).map((module) => ({
    id: idString(module._id), title: module.title,
    lessons: (module.lessons || []).map((lesson) => {
      const id = idString(lesson._id);
      const done = completed.has(id);
      const index = lessonIndex;
      lessonIndex += 1;
      const isUnlocked = isLessonAccessible(lesson, index, entries, accessMode, completed, now, accessOptions);
      let unlockAt = lesson.availableAt ? new Date(lesson.availableAt) : null;
      if (accessMode === 'daily' && index > 0) {
        const previousId = idString(entries[index - 1]?.lesson?._id);
        if (completed.has(previousId)) {
          const previousCompletedAt = completionTimes.get(previousId);
          const dailyUnlock = previousCompletedAt ? nextDailyUnlockAt(previousCompletedAt, timeZone, DAILY_UNLOCK_HOUR) : null;
          if (dailyUnlock && (!unlockAt || dailyUnlock > unlockAt)) unlockAt = dailyUnlock;
        }
      }
      const latest = [...(progress?.assessmentAttempts || [])].reverse().find((attempt) => idString(attempt.lessonId) === id);
      const assessmentAttempts = (progress?.assessmentAttempts || []).filter((attempt) => idString(attempt.lessonId) === id).length;
      return {
        id, title: lesson.title, content: isUnlocked || done || reveal ? lesson.content : '',
        videoUrl: isUnlocked || done || reveal ? lesson.videoUrl : '',
        imageUrl: isUnlocked || done || reveal ? lesson.imageUrl : '',
        ...(reveal ? { imagePublicId: lesson.imagePublicId || '' } : {}),
        resources: isUnlocked || done || reveal ? lesson.resources : [],
        code: isUnlocked || done || reveal ? lesson.code : { language: '', source: '' },
        codeBlocks: isUnlocked || done || reveal ? ((lesson.codeBlocks || []).length ? lesson.codeBlocks : (lesson.code?.source ? [{ language: lesson.code.language, source: lesson.code.source, explanation: '' }] : [])) : [],
        questions: (isUnlocked || done || reveal) ? (lesson.knowledgeCheck || []).map((question) => ({ prompt: question.prompt, options: question.options, ...(reveal ? { correctOption: question.correctOption } : {}), explanation: latest?.passed || reveal ? question.explanation : '' })) : [],
        hasAssessment: (lesson.knowledgeCheck || []).length > 0,
        passMark: lesson.passMark,
        assessmentAttempts: lesson.assessmentAttempts || 3,
        attemptsUsed: assessmentAttempts,
        unlocked: isUnlocked || done || reveal,
        availableAt: lesson.availableAt || null,
        unlockAt: unlockAt instanceof Date && !Number.isNaN(unlockAt.getTime()) ? unlockAt.toISOString() : null,
        completed: done,
        lastScore: latest?.score ?? null,
        lastPassed: latest?.passed ?? false,
      };
    }),
  }));
  const total = entries.length;
  const validIds = new Set(entries.map(({ lesson }) => idString(lesson._id)));
  const done = [...completed].filter((id) => validIds.has(id)).length;
  const currentLesson = progress?.currentLesson ? idString(progress.currentLesson) : entries.find(({ lesson }) => !completed.has(idString(lesson._id)))?.lesson?._id?.toString() || null;
  return { modules, lessonAccessMode: accessMode, progress: { totalLessons: total, completedLessons: done, percent: total ? Math.round(done / total * 100) : 0, currentLesson } };
}

function assertLessonAccessible(course, progress, index, entries) {
  const completed = new Set((progress?.completedLessons || []).map(idString));
  const accessMode = course.lessonAccessMode || 'sequential';
  const timeZone = course.timezone || DEFAULT_COURSE_TIMEZONE;
  const completionTimes = completionTimesFor(progress);
  const now = new Date();
  if (!isLessonAccessible(entries[index].lesson, index, entries, accessMode, completed, now, { completionTimes, timeZone, unlockHour: DAILY_UNLOCK_HOUR })) {
    const availableAt = entries[index].lesson.availableAt;
    if (availableAt && new Date(availableAt) > now) throw ApiError.forbidden(`This lesson is scheduled to open on ${new Date(availableAt).toLocaleString()}.`);
    if (accessMode === 'daily' && index > 0) {
      const previousId = idString(entries[index - 1].lesson._id);
      if (!completed.has(previousId)) throw ApiError.forbidden('Complete the previous day before opening this lesson.');
      const previousCompletedAt = completionTimes.get(previousId);
      const unlockAt = previousCompletedAt ? nextDailyUnlockAt(previousCompletedAt, timeZone, DAILY_UNLOCK_HOUR) : null;
      if (unlockAt && unlockAt > now) throw ApiError.forbidden(`This day unlocks on ${unlockAt.toLocaleString('en', { timeZone, dateStyle: 'medium', timeStyle: 'short' })}.`);
    }
    throw ApiError.forbidden('Complete the previous lesson before opening this lesson.');
  }
}

async function courseAndProgress(req) {
  const course = await LearningClass.findById(req.params.id);
  if (!course) throw ApiError.notFound('Training not found.');
  const admin = isAdmin(req.user);
  const enrolled = (course.students || []).some((student) => idString(student) === idString(req.user._id));
  if (!admin && (req.user.role !== 'student' || !enrolled)) throw ApiError.forbidden('You must be enrolled to access lessons.');
  if (!admin && course.payment?.enabled) {
    const enrollment = await getEnrollment(course._id, req.user._id);
    const payment = paymentState(course, enrollment);
    if (!payment.allowed) {
      throw ApiError.conflict(
        `Payment is required to access this course from day ${payment.freeDays + 1}. Submit your payment reference and wait for admin verification.`,
        { code: 'PAYMENT_REQUIRED', ...payment },
      );
    }
  }
  const progress = admin ? null : await CourseLearningProgress.findOne({ student: req.user._id, course: course._id });
  return { course, progress, admin };
}

export const getLearningCourse = asyncHandler(async (req, res) => {
  const { course, progress, admin } = await courseAndProgress(req);
  res.json({ success: true, data: { ...safeCourse(course, progress, admin), canManage: admin } });
});

export const completeLesson = asyncHandler(async (req, res) => {
  const { course, progress: existing, admin } = await courseAndProgress(req);
  if (admin) throw ApiError.forbidden('Administrator accounts cannot complete lessons as students.');
  const lessons = allLessons(course);
  const index = lessons.findIndex(({ lesson }) => idString(lesson._id) === req.params.lessonId);
  if (index < 0) throw ApiError.notFound('Lesson not found.');
  assertLessonAccessible(course, existing, index, lessons);
  const progress = existing || new CourseLearningProgress({ student: req.user._id, course: course._id });
  if ((lessons[index].lesson.knowledgeCheck || []).length) throw ApiError.conflict('Pass this lesson assessment to complete the lesson.');
  markLessonCompleted(progress, new mongoose.Types.ObjectId(req.params.lessonId));
  const next = lessons[index + 1];
  progress.currentLesson = next?.lesson?._id || null;
  await progress.save();
  res.json({ success: true, data: safeCourse(course, progress) });
});

export const submitLessonAssessment = asyncHandler(async (req, res) => {
  const { course, progress: existing, admin } = await courseAndProgress(req);
  if (admin) throw ApiError.forbidden('Administrator accounts cannot take student lesson assessments.');
  const lessons = allLessons(course);
  const index = lessons.findIndex(({ lesson }) => idString(lesson._id) === req.params.lessonId);
  if (index < 0) throw ApiError.notFound('Lesson not found.');
  assertLessonAccessible(course, existing, index, lessons);
  const lesson = lessons[index].lesson;
  if (!(lesson.knowledgeCheck || []).length) throw ApiError.conflict('This lesson has no assessment.');
  if (req.body.answers.length !== lesson.knowledgeCheck.length) throw ApiError.badRequest('Submit one answer for every question.');
  const progress = existing || new CourseLearningProgress({ student: req.user._id, course: course._id });
  const attemptCount = (progress.assessmentAttempts || []).filter((attempt) => idString(attempt.lessonId) === req.params.lessonId).length;
  const attemptLimit = lesson.assessmentAttempts || 3;
  if (attemptCount >= attemptLimit) throw ApiError.forbidden('The attempt limit for this assessment has been reached.');
  const answers = req.body.answers;
  const correctCount = answers.reduce((count, answer, questionIndex) => count + (lesson.knowledgeCheck[questionIndex].correctOption === answer.optionIndex ? 1 : 0), 0);
  const score = Math.round(correctCount / lesson.knowledgeCheck.length * 100);
  const passed = score >= lesson.passMark;
  progress.assessmentAttempts.push({ lessonId: lesson._id, answers: answers.map((answer) => answer.optionIndex), score, passed });
  if (passed) markLessonCompleted(progress, lesson._id);
  const next = lessons[index + 1];
  progress.currentLesson = passed ? next?.lesson?._id || null : lesson._id;
  await progress.save();
  res.json({ success: true, data: { ...safeCourse(course, progress), result: { score, passed, passMark: lesson.passMark, attempt: attemptCount + 1, attemptLimit, explanations: lesson.knowledgeCheck.map((question, questionIndex) => ({ correct: question.correctOption === answers[questionIndex].optionIndex, correctOption: question.correctOption, explanation: question.explanation })) } } });
});

export const logAssessmentEvent = asyncHandler(async (req, res) => {
  const { course, progress: existing, admin } = await courseAndProgress(req);
  if (admin) throw ApiError.forbidden('Administrator accounts do not have student assessments.');
  const lessons = allLessons(course);
  const index = lessons.findIndex(({ lesson }) => idString(lesson._id) === req.params.lessonId);
  if (index < 0) throw ApiError.notFound('Lesson not found.');
  assertLessonAccessible(course, existing, index, lessons);
  const progress = existing || new CourseLearningProgress({ student: req.user._id, course: course._id });
  progress.securityEvents.push({ lessonId: new mongoose.Types.ObjectId(req.params.lessonId), type: req.body.type });
  if (progress.securityEvents.length > 500) progress.securityEvents.splice(0, progress.securityEvents.length - 500);
  await progress.save();
  res.status(201).json({ success: true, data: { recorded: true } });
});

export const getLearningAnalytics = asyncHandler(async (req, res) => {
  const course = await LearningClass.findById(req.params.id).select('students modules title');
  if (!course) throw ApiError.notFound('Training not found.');
  const records = await CourseLearningProgress.find({ course: course._id }).populate('student', 'name email').sort({ updatedAt: -1 }).lean();
  const lessonIds = new Set((course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => idString(lesson._id))));
  const learners = records.filter((record) => record.student).map((record) => {
    const completed = new Set((record.completedLessons || []).map(idString).filter((id) => lessonIds.has(id))).size;
    return { student: { id: idString(record.student), name: record.student.name, email: record.student.email }, completedLessons: completed, totalLessons: lessonIds.size, percent: lessonIds.size ? Math.round(completed / lessonIds.size * 100) : 0, assessmentAttempts: record.assessmentAttempts?.length || 0, lastActiveAt: record.updatedAt };
  });
  const passedAttempts = records.flatMap((record) => record.assessmentAttempts || []).filter((attempt) => attempt.passed).length;
  const allAttempts = records.flatMap((record) => record.assessmentAttempts || []);
  res.json({ success: true, data: { enrolled: course.students?.length || 0, learners: learners.length, completed: learners.filter((learner) => learner.percent === 100 && learner.totalLessons > 0).length, lessonCount: lessonIds.size, assessmentAttempts: allAttempts.length, assessmentPassRate: allAttempts.length ? Math.round(passedAttempts / allAttempts.length * 100) : 0, learnerProgress: learners.slice(0, 200) } });
});
