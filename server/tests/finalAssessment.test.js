import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeAssessment, sanitizeAssessmentQuestions } from '../src/services/finalAssessment.js';

const questions = Array.from({ length: 20 }, (_, index) => ({
  prompt: `Question ${index + 1}`,
  options: ['A', 'B', 'C', 'D'],
  correctOption: index % 4,
}));

test('final assessment requires at least 80 percent to pass', () => {
  const answers = questions.map((question, questionIndex) => ({
    questionIndex,
    optionIndex: question.correctOption,
  }));
  answers[19].optionIndex = (answers[19].optionIndex + 1) % 4;
  assert.deepEqual(gradeAssessment(questions, answers), { correctCount: 19, score: 95, passed: true });

  answers[18].optionIndex = (answers[18].optionIndex + 1) % 4;
  answers[17].optionIndex = (answers[17].optionIndex + 1) % 4;
  answers[16].optionIndex = (answers[16].optionIndex + 1) % 4;
  assert.deepEqual(gradeAssessment(questions, answers), { correctCount: 16, score: 80, passed: true });

  answers[15].optionIndex = (answers[15].optionIndex + 1) % 4;
  assert.deepEqual(gradeAssessment(questions, answers), { correctCount: 15, score: 75, passed: false });
});

test('student assessment payloads do not expose correct answers', () => {
  const safeQuestions = sanitizeAssessmentQuestions(questions);
  assert.equal(safeQuestions.length, 20);
  assert.equal(safeQuestions[0].id, 0);
  assert.equal(safeQuestions[0].prompt, 'Question 1');
  assert.equal('correctOption' in safeQuestions[0], false);
});

test('final assessment can randomize question and option order without exposing answer keys', () => {
  const order = questions.slice(0, 10).map((_, index) => 9 - index);
  const optionOrders = questions.slice(0, 10).map(() => [3, 2, 1, 0]);
  const safeQuestions = sanitizeAssessmentQuestions(questions.slice(0, 10), order, optionOrders);
  assert.equal(safeQuestions[0].prompt, 'Question 10');
  assert.deepEqual(safeQuestions[0].options, ['D', 'C', 'B', 'A']);
  assert.equal('correctOption' in safeQuestions[0], false);
});

test('10-question certification assessments pass at 80 percent and omit answer keys', () => {
  const certificationQuestions = questions.slice(0, 10);
  const answers = certificationQuestions.map((question, questionIndex) => ({
    questionIndex,
    optionIndex: question.correctOption,
  }));
  answers[0].optionIndex = (answers[0].optionIndex + 1) % 4;
  answers[1].optionIndex = (answers[1].optionIndex + 1) % 4;
  assert.deepEqual(gradeAssessment(certificationQuestions, answers), { correctCount: 8, score: 80, passed: true });

  answers[2].optionIndex = (answers[2].optionIndex + 1) % 4;
  assert.deepEqual(gradeAssessment(certificationQuestions, answers), { correctCount: 7, score: 70, passed: false });
  assert.equal('correctOption' in sanitizeAssessmentQuestions(certificationQuestions)[0], false);
});
