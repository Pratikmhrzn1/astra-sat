import { apiClient, getApiError } from '@/shared/api/http';

/**
 * The exam a student sits — practice set, topic practice, mistake review or mock
 * module — and the endpoints that start, load, save, submit and report it.
 * Shared by practice, the exam player, exam review and the dashboards.
 */

export interface QuestionSet {
  id: string;
  title: string;
  subject: 'english' | 'math';
  description: string;
  questionCount: number;
  createdAt: string;
}

export interface Question {
  id: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  imageUrl: string | null;
  passageId: string | null;
  passageText: string | null;
  passageTitle: string | null;
  orderIndex: number;
}

export interface QuestionWithAnswer extends Question {
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  selectedAnswer: string | null;
  selectedAnswerText: string | null;
  isCorrect: boolean | null;
}

export interface Exam {
  id: string;
  studentId: string;
  /** Null for an exam assembled across sets rather than from one. */
  setId: string | null;
  /** Display name for a set-less exam, e.g. "Topic: Algebra". */
  label: string | null;
  type: 'individual' | 'mock_english' | 'mock_math';
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  /**
   * Section score on the 200-800 scale, written by the server at submit time.
   *
   * Null in three cases, all of which mean "do not show a scaled number":
   * the exam predates scaled scoring, it is too short to scale, or it is one
   * module of a mock — half a section, scored on the mock's own row instead.
   */
  scaledScore: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ExamWithSet extends Exam {
  /** Null for an exam that belongs to no set; `label` names those instead. */
  setTitle: string | null;
  /**
   * Never null: for a set-less exam the server derives it from the exam's own
   * questions, because every consumer here filters or labels on it.
   */
  subject: 'english' | 'math';
}

export interface MockTest {
  id: string;
  studentId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  englishM2ExamId: string | null;
  mathM2ExamId: string | null;
  status: 'in_progress' | 'completed';
  /**
   * Composite scores, written when the final module is submitted. Each section
   * is Module 1 + Module 2 scaled against the adaptive path the student earned;
   * `totalScore` is their sum on the 400-1600 scale. Null until the mock is
   * finished, or if a section was too short to scale.
   */
  rwScore: number | null;
  mathScore: number | null;
  totalScore: number | null;
  startedAt: string;
  completedAt: string | null;
}

/** One module of a mock, as reported alongside an exam's results. */
export interface MockModule {
  examId: string;
  subject: 'english' | 'math';
  module: 1 | 2;
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  totalQuestions: number;
  setDifficulty: string | null;
}

/**
 * The mock an exam belongs to. Present on a results response whenever the exam
 * is one of a mock's four modules, so the client never has to work out
 * membership from the exam type — live exams share those types.
 */
export interface MockContext {
  id: string;
  status: 'in_progress' | 'completed';
  rwScore: number | null;
  mathScore: number | null;
  totalScore: number | null;
  completedAt: string | null;
  modules: MockModule[];
}

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const { data } = await apiClient.get<QuestionSet[]>('/student/question-sets');
  return data;
}

export async function startExam(setId: string): Promise<{ exam: Exam; questions: Question[] }> {
  const { data } = await apiClient.post('/student/exams', { setId, type: 'individual' });
  return data;
}

export type MockSection = 'english_m1' | 'english_m2' | 'math_m1' | 'math_m2';

export async function getExam(examId: string, { open = false }: { open?: boolean } = {}): Promise<{
  exam: Exam;
  questions: Question[];
  answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[];
  /** The mock this exam belongs to, if any. */
  mockTestId: string | null;
  /** Where the Math section starts, so the player can chain English -> Math. */
  mathExamId: string | null;
  /** Which module of its mock this exam is; null outside a mock. */
  mockSection: MockSection | null;
  /** Server deadline for this attempt; null when untimed or not yet opened. */
  deadlineAt: string | null;
  /** The server's clock at response time, to correct a wrong device clock. */
  serverNow: string;
}> {
  // `open` is the player actually starting the exam — it starts a mock module's
  // clock on the server. Pre-fetches must leave it off.
  const { data } = await apiClient.get(`/student/exams/${examId}`, { params: open ? { open: 1 } : undefined });
  return data;
}

export async function saveAnswers(
  examId: string,
  answers: { questionId: string; selectedAnswer?: string | null; selectedAnswerText?: string | null }[],
  timeSpentSeconds?: number
): Promise<void> {
  await apiClient.put(`/student/exams/${examId}/answers`, { answers, timeSpentSeconds });
}

export type AnswerPayload = { questionId: string; selectedAnswer?: string | null; selectedAnswerText?: string | null };

/** `answers` are the player's final picks; the server saves them before it grades. */
export async function submitExam(
  examId: string,
  timeSpentSeconds?: number,
  answers?: AnswerPayload[],
): Promise<{ score: number; total: number; percentage: number }> {
  const { data } = await apiClient.post(`/student/exams/${examId}/submit`, { timeSpentSeconds, answers });
  return data;
}

/**
 * Submits, treating "already completed" as success.
 *
 * The server closes a timed exam itself once its deadline passes, so by the time
 * the player's own countdown fires the exam may already be graded. That is the
 * outcome the student wanted, not an error to stall the section transition on.
 */
export async function submitExamIfOpen(examId: string, timeSpentSeconds?: number, answers?: AnswerPayload[]): Promise<void> {
  try {
    await submitExam(examId, timeSpentSeconds, answers);
  } catch (err) {
    if (/already completed/i.test(getApiError(err))) return;
    throw err;
  }
}

export async function getExams(): Promise<ExamWithSet[]> {
  const { data } = await apiClient.get<ExamWithSet[]>('/student/exams');
  return data;
}

export async function getExamResults(examId: string): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  results: QuestionWithAnswer[];
  /** Non-null when this exam is one module of a mock; carries the mock's scores. */
  mock: MockContext | null;
}> {
  const { data } = await apiClient.get(`/student/exams/${examId}/results`);
  return data;
}

export async function startMockTest(): Promise<{
  mockTest: MockTest;
  englishExam: Exam;
  mathExam: Exam;
  englishQuestions: Question[];
  mathQuestions: Question[];
}> {
  const { data } = await apiClient.post('/student/mock-tests');
  return data;
}

export async function getMockTests(): Promise<MockTest[]> {
  const { data } = await apiClient.get<MockTest[]>('/student/mock-tests');
  return data;
}

export async function getMockTest(mockTestId: string): Promise<{
  mockTest: MockTest;
  englishExam: Exam | null;
  mathExam: Exam | null;
}> {
  const { data } = await apiClient.get(`/student/mock-tests/${mockTestId}`);
  return data;
}

export async function nextModule(mockTestId: string, submittedExamId: string): Promise<{
  m2ExamId: string;
  m2Questions: Question[];
  m2Difficulty: 'hard' | 'low';
  percentage: number;
}> {
  const { data } = await apiClient.post(`/student/mock-tests/${mockTestId}/next-module`, { submittedExamId });
  return data;
}
