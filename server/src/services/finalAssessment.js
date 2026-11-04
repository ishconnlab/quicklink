export function sanitizeAssessmentQuestions(questions) {
  return questions.map((question, index) => ({
    id: index,
    prompt: question.prompt,
    options: question.options,
  }));
}

export function gradeAssessment(questions, answers) {
  const answerByQuestion = new Map(answers.map(({ questionIndex, optionIndex }) => [questionIndex, optionIndex]));
  const correctCount = questions.reduce(
    (count, question, index) => count + (answerByQuestion.get(index) === question.correctOption ? 1 : 0),
    0,
  );
  const score = Math.round(correctCount / questions.length * 100);
  return { correctCount, score, passed: score >= 80 };
}
