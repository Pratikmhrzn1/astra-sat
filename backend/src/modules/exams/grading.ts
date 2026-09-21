/**
 * Answer grading. Kept separate from the routes because it is the one piece of
 * logic in the product that must never drift: the same rules run when a student
 * confirms a single question in practice and when a whole exam is submitted.
 */

/** Parses a grid-in answer, accepting `3/4` and `0.75` alike. */
export function parseNumericAnswer(value: string): number | null {
  const trimmed = value.trim();

  const fraction = trimmed.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = parseInt(fraction[2], 10);
    return denominator === 0 ? null : parseInt(fraction[1], 10) / denominator;
  }

  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Grades a student-produced response.
 *
 * An exact text match wins immediately, which covers non-numeric answers. Past
 * that the two sides are compared numerically with a small tolerance, so `3/4`,
 * `0.75` and `.75` are all accepted for the same question — the SAT scores the
 * value, not the notation.
 */
export function sprIsCorrect(studentAnswer: string, correctAnswer: string): boolean {
  if (studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) return true;

  const student = parseNumericAnswer(studentAnswer);
  const correct = parseNumericAnswer(correctAnswer);
  if (student === null || correct === null) return false;

  return Math.abs(student - correct) < 0.001;
}

export interface GradableAnswer {
  questionType: 'multiple_choice' | 'student_produced_response';
  selectedAnswer: string | null;
  selectedAnswerText: string | null;
  correctAnswer: string | null;
  correctAnswerText: string | null;
}

/** The single definition of "did they get it right". Unanswered is always wrong. */
export function gradeAnswer(answer: GradableAnswer): boolean {
  if (answer.questionType === 'student_produced_response') {
    return answer.selectedAnswerText
      ? sprIsCorrect(answer.selectedAnswerText, answer.correctAnswerText ?? '')
      : false;
  }
  return answer.selectedAnswer !== null && answer.selectedAnswer === answer.correctAnswer;
}

/** Whether a saved response counts as answered, for stamping `answered_at`. */
export function hasAnswer(selectedAnswer: unknown, selectedAnswerText: unknown): boolean {
  if (selectedAnswer != null) return true;
  return typeof selectedAnswerText === 'string' && selectedAnswerText.trim() !== '';
}

/** Percentage correct, guarding the empty-exam case that would divide by zero. */
export function percentage(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}
