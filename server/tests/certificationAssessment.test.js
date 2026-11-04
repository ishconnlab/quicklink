import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningClass } from '../src/models/LearningClass.js';
import { CourseCertificate } from '../src/models/CourseCertificate.js';

const questions = Array.from({ length: 10 }, (_, index) => ({
  prompt: `Question ${index + 1}`,
  options: ['A', 'B', 'C', 'D'],
  correctOption: 0,
}));

function trainingWithQuestions(certificationQuestions) {
  return new LearningClass({
    title: 'Certification training',
    subject: 'Training',
    level: 'L3',
    teacher: '0123456789abcdef01234567',
    createdBy: '0123456789abcdef01234567',
    certificationAssessmentEnabled: true,
    certificationQuestions,
  });
}

test('certification assessments accept exactly 10 four-option questions', () => {
  assert.equal(trainingWithQuestions(questions).validateSync(), undefined);
  assert.ok(trainingWithQuestions(questions.slice(0, 9)).validateSync());

  const invalidOptions = questions.map((question) => ({ ...question, options: ['A', 'B', 'C'] }));
  const validationError = trainingWithQuestions(invalidOptions).validateSync();
  assert.ok(validationError);
  assert.ok(Object.keys(validationError.errors).some((path) => path.startsWith('certificationQuestions')));
});

test('Bootcamp and Training are valid class and certificate levels', () => {
  for (const level of ['Bootcamp', 'Training']) {
    const training = trainingWithQuestions(questions);
    training.level = level;
    assert.equal(training.validateSync(), undefined);

    const certificate = new CourseCertificate({
      code: 'a'.repeat(32),
      student: '0123456789abcdef01234567',
      course: '0123456789abcdef01234568',
      studentName: 'Test Student',
      courseTitle: 'Test Training',
      level,
    });
    assert.equal(certificate.validateSync(), undefined);
  }
});
