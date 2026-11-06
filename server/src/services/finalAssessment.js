export function sanitizeAssessmentQuestions(questions) {
  return questions.map((question, index) => ({
    id: index,
    prompt: question.prompt,
    options: question.options,
  }));
}

export function gradeAssessment(questions, answers, passMark = 80) {
  if (!questions.length) return { correctCount: 0, score: 0, passed: false };
  const answerByQuestion = new Map(answers.map(({ questionIndex, optionIndex }) => [questionIndex, optionIndex]));
  const correctCount = questions.reduce(
    (count, question, index) => count + (answerByQuestion.get(index) === question.correctOption ? 1 : 0),
    0,
  );
  const score = Math.round(correctCount / questions.length * 100);
  const threshold = Math.min(100, Math.max(1, Number(passMark) || 80));
  return { correctCount, score, passed: score >= threshold };
}
