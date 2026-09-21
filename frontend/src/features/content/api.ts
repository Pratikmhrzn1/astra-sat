import { apiClient } from '@/shared/api/http';

/** Content authoring: question sets, passages, questions and bulk import. */

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

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const { data } = await apiClient.get<QuestionSet[]>('/teacher/question-sets');
  return data;
}

export async function createQuestionSet(payload: { title: string; subject: 'english' | 'math'; description: string; difficulty?: 'low' | 'medium' | 'hard' | null; isLiveExam?: boolean }): Promise<QuestionSet> {
  const { data } = await apiClient.post<QuestionSet>('/teacher/question-sets', payload);
  return data;
}

/**
 * `isLiveExam` is editable here, not only at creation. Live sessions are offered
 * only sets carrying that flag, so without a way to set it on an existing set a
 * teacher has to re-author their whole paper to run one.
 */
export async function updateQuestionSet(setId: string, payload: Partial<{ title: string; description: string; difficulty: 'low' | 'medium' | 'hard' | null; isLiveExam: boolean }>): Promise<QuestionSet> {
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
