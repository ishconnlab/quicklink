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
