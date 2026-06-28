import { apiClient } from './client';

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
  setId: string;
  type: 'individual' | 'mock_english' | 'mock_math';
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ExamWithSet extends Exam {
  setTitle: string;
  subject: 'english' | 'math';
}

export interface MockTest {
  id: string;
  studentId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string | null;
}

export interface FeedbackItem {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  examId: string | null;
  teacherName: string;
  teacherEmail: string;
}

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const { data } = await apiClient.get<QuestionSet[]>('/student/question-sets');
  return data;
}

export async function startExam(setId: string): Promise<{ exam: Exam; questions: Question[] }> {
  const { data } = await apiClient.post('/student/exams', { setId, type: 'individual' });
  return data;
}

export async function getExam(examId: string): Promise<{
  exam: Exam;
  questions: Question[];
  answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[];
}> {
  const { data } = await apiClient.get(`/student/exams/${examId}`);
  return data;
}

export async function saveAnswers(
  examId: string,
  answers: { questionId: string; selectedAnswer?: string | null; selectedAnswerText?: string | null }[],
  timeSpentSeconds?: number
): Promise<void> {
  await apiClient.put(`/student/exams/${examId}/answers`, { answers, timeSpentSeconds });
}

export async function submitExam(
  examId: string,
  timeSpentSeconds?: number
): Promise<{ score: number; total: number; percentage: number }> {
  const { data } = await apiClient.post(`/student/exams/${examId}/submit`, { timeSpentSeconds });
  return data;
}

export async function getExams(): Promise<ExamWithSet[]> {
  const { data } = await apiClient.get<ExamWithSet[]>('/student/exams');
  return data;
}

export async function getExamResults(examId: string): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  results: QuestionWithAnswer[];
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

export async function getFeedback(): Promise<FeedbackItem[]> {
  const { data } = await apiClient.get<FeedbackItem[]>('/student/feedback');
  return data;
}

export async function markFeedbackRead(feedbackId: string): Promise<void> {
  await apiClient.put(`/student/feedback/${feedbackId}/read`);
}
