import { apiClient } from './client';
import type { Exam, QuestionWithAnswer } from './student';

export interface Student {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface QuestionSet {
  id: string;
  title: string;
  subject: 'english' | 'math';
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  setId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  orderIndex: number;
}

export interface FeedbackSent {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  examId: string | null;
  studentName: string;
  studentEmail: string;
}

export async function getStudents(): Promise<Student[]> {
  const { data } = await apiClient.get<Student[]>('/teacher/students');
  return data;
}

export async function getStudentExams(
  studentId: string
): Promise<(Exam & { setTitle: string; subject: string })[]> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}/exams`);
  return data;
}

export async function getStudentExamResults(
  studentId: string,
  examId: string
): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  student: Student;
  results: QuestionWithAnswer[];
}> {
  const { data } = await apiClient.get(
    `/teacher/students/${studentId}/exams/${examId}/results`
  );
  return data;
}

export async function sendFeedback(
  studentId: string,
  content: string,
  examId?: string
): Promise<void> {
  await apiClient.post('/teacher/feedback', { studentId, content, examId });
}

export async function getSentFeedback(): Promise<FeedbackSent[]> {
  const { data } = await apiClient.get<FeedbackSent[]>('/teacher/feedback');
  return data;
}

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const { data } = await apiClient.get<QuestionSet[]>('/teacher/question-sets');
  return data;
}

export async function createQuestionSet(payload: {
  title: string;
  subject: 'english' | 'math';
  description: string;
}): Promise<QuestionSet> {
  const { data } = await apiClient.post<QuestionSet>('/teacher/question-sets', payload);
  return data;
}

export async function getSetQuestions(setId: string): Promise<Question[]> {
  const { data } = await apiClient.get<Question[]>(`/teacher/question-sets/${setId}/questions`);
  return data;
}

export async function addQuestion(
  setId: string,
  payload: {
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: 'a' | 'b' | 'c' | 'd';
    explanation?: string;
    orderIndex: number;
  }
): Promise<Question> {
  const { data } = await apiClient.post<Question>(
    `/teacher/question-sets/${setId}/questions`,
    payload
  );
  return data;
}

export async function updateQuestion(
  questionId: string,
  payload: Partial<Omit<Question, 'id' | 'setId'>>
): Promise<Question> {
  const { data } = await apiClient.put<Question>(`/teacher/questions/${questionId}`, payload);
  return data;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await apiClient.delete(`/teacher/questions/${questionId}`);
}

export async function deleteQuestionSet(setId: string): Promise<void> {
  await apiClient.delete(`/teacher/question-sets/${setId}`);
}
