import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { LearningClass } from '../src/models/LearningClass.js';
import { CourseLearningProgress } from '../src/models/CourseLearningProgress.js';
import { CourseCertificate } from '../src/models/CourseCertificate.js';

const questions = Array.from({ length: 10 }, (_, index) => ({
  prompt: `Question ${index + 1}`,
  options: ['A', 'B', 'C', 'D'],
  correctOption: 0,
  explanation: 'Review the lesson concept.',
}));

test('course lessons accept five- and ten-question knowledge checks with four options', () => {
  const course = new LearningClass({
    title: 'Python basics', subject: 'Programming', level: 'Training',
    modules: [{ title: 'Foundations', lessons: [{ title: 'Variables', knowledgeCheck: questions.slice(0, 5) }] }],
  });
  assert.equal(course.validateSync(), undefined);
  course.modules[0].lessons[0].knowledgeCheck = questions;
  assert.equal(course.validateSync(), undefined);
  course.modules[0].lessons[0].knowledgeCheck.pop();
  course.modules[0].lessons[0].knowledgeCheck.pop();
  assert.match(course.validateSync().message, /5 or 10 questions/);
});

test('course learning progress is unique per student and course', () => {
  const progress = new CourseLearningProgress({ student: new mongoose.Types.ObjectId(), course: new mongoose.Types.ObjectId() });
  assert.equal(progress.validateSync(), undefined);
  assert.deepEqual(progress.completedLessons, []);
  assert.deepEqual(progress.assessmentAttempts, []);
});

test('certificate payment is free by default and can be held for payment review', () => {
  const course = new LearningClass({ title: 'Web foundations', subject: 'Programming', level: 'Training' });
  assert.equal(course.certificatePayment.enabled, false);
  const certificate = new CourseCertificate({ code: 'a'.repeat(32), student: new mongoose.Types.ObjectId(), course: new mongoose.Types.ObjectId(), studentName: 'Learner', courseTitle: 'Web foundations', paymentStatus: 'pending', paymentAmount: 5000, paymentCurrency: 'RWF', paymentReference: 'TX-100' });
  assert.equal(certificate.validateSync(), undefined);
});
