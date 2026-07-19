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
  difficulty: 'low' | 'medium' | 'hard' | null;
  createdAt: string;
  updatedAt: string;
}

export interface Passage {
  id: string;
  setId: string;
  title: string;
  passageText: string;
  orderIndex: number;
  createdAt: string;
}

export type SubSkill = 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions';

export type SubSkillSource = 'ai_suggested' | 'human_confirmed';

export interface Question {
  id: string;
  setId: string;
  passageId: string | null;
  questionType: 'multiple_choice' | 'student_produced_response';
  subSkill: SubSkill | null;
  subSkillSource: SubSkillSource | null;
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
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

export async function getStudentExams(studentId: string): Promise<(Exam & { setTitle: string; subject: string })[]> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}/exams`);
  return data;
}

export async function getStudentExamResults(studentId: string, examId: string): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  student: Student;
  results: QuestionWithAnswer[];
}> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}/exams/${examId}/results`);
  return data;
}

export async function sendFeedback(studentId: string, content: string, examId?: string): Promise<void> {
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

export async function createQuestionSet(payload: { title: string; subject: 'english' | 'math'; description: string; difficulty?: 'low' | 'medium' | 'hard' | null }): Promise<QuestionSet> {
  const { data } = await apiClient.post<QuestionSet>('/teacher/question-sets', payload);
  return data;
}

export async function deleteQuestionSet(setId: string): Promise<void> {
  await apiClient.delete(`/teacher/question-sets/${setId}`);
}

export async function getSetPassages(setId: string): Promise<Passage[]> {
  const { data } = await apiClient.get<Passage[]>(`/teacher/question-sets/${setId}/passages`);
  return data;
}

export async function createPassage(setId: string, payload: { title: string; passageText: string; orderIndex: number }): Promise<Passage> {
  const { data } = await apiClient.post<Passage>(`/teacher/question-sets/${setId}/passages`, payload);
  return data;
}

export async function updatePassage(passageId: string, payload: Partial<{ title: string; passageText: string }>): Promise<Passage> {
  const { data } = await apiClient.put<Passage>(`/teacher/passages/${passageId}`, payload);
  return data;
}

export async function deletePassage(passageId: string): Promise<void> {
  await apiClient.delete(`/teacher/passages/${passageId}`);
}

export async function getSetQuestions(setId: string): Promise<Question[]> {
  const { data } = await apiClient.get<Question[]>(`/teacher/question-sets/${setId}/questions`);
  return data;
}

export async function addQuestion(setId: string, payload: Omit<Question, 'id' | 'setId' | 'subSkillSource'>): Promise<Question> {
  const { data } = await apiClient.post<Question>(`/teacher/question-sets/${setId}/questions`, payload);
  return data;
}

export async function updateQuestionSubSkill(
  questionId: string,
  payload: { subSkill?: SubSkill | null; subSkillSource: SubSkillSource },
): Promise<Question> {
  const { data } = await apiClient.put<Question>(`/teacher/questions/${questionId}/subskill`, payload);
  return data;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await apiClient.delete(`/teacher/questions/${questionId}`);
}

export interface QuestionSetImportPayload {
  title: string;
  subject: 'english' | 'math';
  description?: string;
  passages?: Array<{
    title?: string;
    passageText: string;
    orderIndex?: number;
  }>;
  questions: Array<{
    passageIndex?: number | null;
    questionType: 'multiple_choice' | 'student_produced_response';
    questionText: string;
    subSkill?: SubSkill | null;
    optionA?: string | null;
    optionB?: string | null;
    optionC?: string | null;
    optionD?: string | null;
    correctAnswer?: 'a' | 'b' | 'c' | 'd' | null;
    correctAnswerText?: string | null;
    explanation?: string | null;
    orderIndex?: number;
  }>;
}

export async function importQuestionSetFromJSON(
  payload: QuestionSetImportPayload,
): Promise<{ set: QuestionSet; questionCount: number; passageCount: number }> {
  const { data } = await apiClient.post('/teacher/question-sets/import-json', payload);
  return data;
}

export interface TeacherVocabWord {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  createdAt: string;
}

export async function getTeacherVocabWords(): Promise<TeacherVocabWord[]> {
  const { data } = await apiClient.get<TeacherVocabWord[]>('/teacher/vocab-words');
  return data;
}

export async function createTeacherVocabWord(payload: { word: string; definition: string; exampleSentence?: string }): Promise<TeacherVocabWord> {
  const { data } = await apiClient.post<TeacherVocabWord>('/teacher/vocab-words', payload);
  return data;
}

export async function deleteTeacherVocabWord(wordId: string): Promise<void> {
  await apiClient.delete(`/teacher/vocab-words/${wordId}`);
}
