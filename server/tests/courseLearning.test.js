import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { LearningClass } from '../src/models/LearningClass.js';
import { CourseLearningProgress } from '../src/models/CourseLearningProgress.js';

const questions = Array.from({ length: 10 }, (_, index) => ({
  prompt: `Question ${index + 1}`,
  options: ['A', 'B', 'C', 'D'],
  correctOption: 0,
  explanation: 'Review the lesson concept.',
}));

test('course lessons validate complete four-option, ten-question knowledge checks', () => {
  const course = new LearningClass({
    title: 'Python basics', subject: 'Programming', level: 'Training',
    modules: [{ title: 'Foundations', lessons: [{ title: 'Variables', knowledgeCheck: questions }] }],
  });
  assert.equal(course.validateSync(), undefined);
  course.modules[0].lessons[0].knowledgeCheck.pop();
  assert.match(course.validateSync().message, /exactly 10 questions/);
});

test('course learning progress is unique per student and course', () => {
  const progress = new CourseLearningProgress({ student: new mongoose.Types.ObjectId(), course: new mongoose.Types.ObjectId() });
  assert.equal(progress.validateSync(), undefined);
  assert.deepEqual(progress.completedLessons, []);
  assert.deepEqual(progress.assessmentAttempts, []);
});
