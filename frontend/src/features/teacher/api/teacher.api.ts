import { apiClient } from '@/shared/api/client';
import type { Exam, QuestionWithAnswer } from '@/features/student/api/student.api';

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
  isDraft: boolean;
  isLiveExam: boolean;
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

/**
 * LEGACY. The five Reading-and-Writing values of the old `sub_skill` enum,
 * superseded by `skillCode`. Still in the payload because the column exists;
 * nothing in the UI writes it any more.
 */
export type SubSkill = 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions';

export type SubSkillSource = 'ai_suggested' | 'human_confirmed';

/** Per-question difficulty. A *set's* difficulty is `low | medium | hard` — different scale. */
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  setId: string;
  passageId: string | null;
  questionType: 'multiple_choice' | 'student_produced_response';
  subSkill: SubSkill | null;
  /** A domain or skill code from `/skills`. Covers Math, which `subSkill` never could. */
  skillCode: string | null;
  difficulty: QuestionDifficulty | null;
  subSkillSource: SubSkillSource | null;
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  imageUrl: string | null;
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

export interface StudentProfile {
  id: string;
  studentId: string;
  targetScore: number | null;
  testDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `profile` is null until the student sets a goal — show that, don't substitute one. */
export async function getStudentDetail(studentId: string): Promise<{
  student: { id: string; name: string; email: string; role: string };
  profile: StudentProfile | null;
}> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}`);
  return data;
}

/**
 * `setTitle` and `subject` are null for an exam that belongs to no set — topic
 * practice and mistake reviews are assembled across many sets. Those carry a
 * `label` of their own instead.
 */
export async function getStudentExams(
  studentId: string,
): Promise<(Exam & { setTitle: string | null; label: string | null; subject: string | null })[]> {
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

export async function createQuestionSet(payload: { title: string; subject: 'english' | 'math'; description: string; difficulty?: 'low' | 'medium' | 'hard' | null; isLiveExam?: boolean }): Promise<QuestionSet> {
  const { data } = await apiClient.post<QuestionSet>('/teacher/question-sets', payload);
  return data;
}

export async function updateQuestionSet(setId: string, payload: Partial<{ title: string; description: string; difficulty: 'low' | 'medium' | 'hard' | null }>): Promise<QuestionSet> {
  const { data } = await apiClient.put<QuestionSet>(`/teacher/question-sets/${setId}`, payload);
  return data;
}

export async function deleteQuestionSet(setId: string): Promise<void> {
  await apiClient.delete(`/teacher/question-sets/${setId}`);
}

export async function publishQuestionSet(setId: string): Promise<QuestionSet> {
  const { data } = await apiClient.post<QuestionSet>(`/teacher/question-sets/${setId}/publish`);
  return data;
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

/** `subSkill` is omitted too: tagging goes through `skillCode` now. */
export async function addQuestion(setId: string, payload: Omit<Question, 'id' | 'setId' | 'subSkillSource' | 'subSkill'>): Promise<Question> {
  const { data } = await apiClient.post<Question>(`/teacher/question-sets/${setId}/questions`, payload);
  return data;
}

export async function updateQuestion(questionId: string, payload: Omit<Question, 'id' | 'setId' | 'subSkillSource' | 'subSkill'>): Promise<Question> {
  const { data } = await apiClient.put<Question>(`/teacher/questions/${questionId}`, payload);
  return data;
}

/** Confirm or override an AI-suggested tag. Takes a skill code, so Math is correctable. */
export async function updateQuestionSubSkill(
  questionId: string,
  payload: { skillCode?: string | null; subSkillSource: SubSkillSource },
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
  /** Adaptive tier for the whole set. Without it the set is invisible to mock selection. */
  difficulty?: 'low' | 'medium' | 'hard' | null;
  /** Defaults to true server-side, so a bad paste is never live to students. */
  isDraft?: boolean;
  passages?: Array<{
    title?: string;
    passageText: string;
    orderIndex?: number;
  }>;
  questions: Array<{
    passageIndex?: number | null;
    questionType: 'multiple_choice' | 'student_produced_response';
    questionText: string;
    skillCode?: string | null;
    difficulty?: QuestionDifficulty | null;
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
