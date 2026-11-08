import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { LearningClass } from '../models/LearningClass.js';
import { CourseLearningProgress } from '../models/CourseLearningProgress.js';
import { isAdmin } from '../security/roles.js';

const idString = (value) => String(value?._id || value || '');
function allLessons(course) {
  return (course.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ module, lesson })));
}
function safeCourse(course, progress, reveal = false) {
  const completed = new Set((progress?.completedLessons || []).map(idString));
  const entries = allLessons(course);
  let unlocked = true;
  const modules = (course.modules || []).map((module) => ({
    id: idString(module._id), title: module.title,
    lessons: (module.lessons || []).map((lesson) => {
      const id = idString(lesson._id);
      const isUnlocked = unlocked;
      const done = completed.has(id);
      unlocked = unlocked && done;
      const latest = [...(progress?.assessmentAttempts || [])].reverse().find((attempt) => idString(attempt.lessonId) === id);
      const assessmentAttempts = (progress?.assessmentAttempts || []).filter((attempt) => idString(attempt.lessonId) === id).length;
      return {
        id, title: lesson.title, content: isUnlocked || done || reveal ? lesson.content : '',
        videoUrl: isUnlocked || done || reveal ? lesson.videoUrl : '',
        imageUrl: isUnlocked || done || reveal ? lesson.imageUrl : '',
        ...(reveal ? { imagePublicId: lesson.imagePublicId || '' } : {}),
        resources: isUnlocked || done || reveal ? lesson.resources : [],
        code: isUnlocked || done || reveal ? lesson.code : { language: '', source: '' },
        questions: (isUnlocked || done || reveal) ? (lesson.knowledgeCheck || []).map((question) => ({ prompt: question.prompt, options: question.options, ...(reveal ? { correctOption: question.correctOption } : {}), explanation: latest?.passed || reveal ? question.explanation : '' })) : [],
        hasAssessment: (lesson.knowledgeCheck || []).length > 0,
        passMark: lesson.passMark,
        assessmentAttempts: lesson.assessmentAttempts || 3,
        attemptsUsed: assessmentAttempts,
        unlocked: isUnlocked || done || reveal,
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
  return { modules, progress: { totalLessons: total, completedLessons: done, percent: total ? Math.round(done / total * 100) : 0, currentLesson } };
}

async function courseAndProgress(req) {
  const course = await LearningClass.findById(req.params.id);
  if (!course) throw ApiError.notFound('Training not found.');
  const admin = isAdmin(req.user);
  const enrolled = (course.students || []).some((student) => idString(student) === idString(req.user._id));
  if (!admin && (req.user.role !== 'student' || !enrolled)) throw ApiError.forbidden('You must be enrolled to access lessons.');
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
  const progress = existing || new CourseLearningProgress({ student: req.user._id, course: course._id });
  if (index > 0 && !(progress.completedLessons || []).some((id) => idString(id) === idString(lessons[index - 1].lesson._id))) throw ApiError.conflict('Complete the previous lesson first.');
  if ((lessons[index].lesson.knowledgeCheck || []).length) throw ApiError.conflict('Pass this lesson assessment to complete the lesson.');
  if (!(progress.completedLessons || []).some((id) => idString(id) === req.params.lessonId)) progress.completedLessons.push(new mongoose.Types.ObjectId(req.params.lessonId));
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
  const lesson = lessons[index].lesson;
  if (!(lesson.knowledgeCheck || []).length) throw ApiError.conflict('This lesson has no assessment.');
  const progress = existing || new CourseLearningProgress({ student: req.user._id, course: course._id });
  if (index > 0 && !(progress.completedLessons || []).some((id) => idString(id) === idString(lessons[index - 1].lesson._id))) throw ApiError.conflict('Complete the previous lesson first.');
  const attemptCount = (progress.assessmentAttempts || []).filter((attempt) => idString(attempt.lessonId) === req.params.lessonId).length;
  const attemptLimit = lesson.assessmentAttempts || 3;
  if (attemptCount >= attemptLimit) throw ApiError.forbidden('The attempt limit for this assessment has been reached.');
  const answers = req.body.answers;
  const correctCount = answers.reduce((count, answer, questionIndex) => count + (lesson.knowledgeCheck[questionIndex].correctOption === answer.optionIndex ? 1 : 0), 0);
  const score = Math.round(correctCount / lesson.knowledgeCheck.length * 100);
  const passed = score >= lesson.passMark;
  progress.assessmentAttempts.push({ lessonId: lesson._id, answers: answers.map((answer) => answer.optionIndex), score, passed });
  if (passed && !(progress.completedLessons || []).some((id) => idString(id) === req.params.lessonId)) progress.completedLessons.push(lesson._id);
  const next = lessons[index + 1];
  progress.currentLesson = passed ? next?.lesson?._id || null : lesson._id;
  await progress.save();
  res.json({ success: true, data: { ...safeCourse(course, progress), result: { score, passed, passMark: lesson.passMark, attempt: attemptCount + 1, attemptLimit, explanations: lesson.knowledgeCheck.map((question, questionIndex) => ({ correct: question.correctOption === answers[questionIndex].optionIndex, correctOption: question.correctOption, explanation: question.explanation })) } } });
});

export const logAssessmentEvent = asyncHandler(async (req, res) => {
  const { course, progress: existing, admin } = await courseAndProgress(req);
  if (admin) throw ApiError.forbidden('Administrator accounts do not have student assessments.');
  if (!allLessons(course).some(({ lesson }) => idString(lesson._id) === req.params.lessonId)) throw ApiError.notFound('Lesson not found.');
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
