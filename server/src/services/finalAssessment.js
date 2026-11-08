export function sanitizeAssessmentQuestions(questions, questionOrder = [], optionOrders = []) {
  const order = questionOrder.length === questions.length ? questionOrder : questions.map((_, index) => index);
  return order.map((originalIndex, displayIndex) => ({
    id: displayIndex,
    prompt: questions[originalIndex].prompt,
    options: (optionOrders[originalIndex]?.length === questions[originalIndex].options.length
      ? optionOrders[originalIndex]
      : questions[originalIndex].options.map((_, index) => index)).map((optionIndex) => questions[originalIndex].options[optionIndex]),
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
