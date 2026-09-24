import { apiTransport } from '@/shared/api/http';

/** Content authoring: question sets, passages, questions and bulk import. */

export interface AuthoringBundle {
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

export interface Extract {
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
export type SubCompetency = 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions';

export type SubCompetencySource = 'ai_suggested' | 'human_confirmed';

/** Per-question difficulty. A *set's* difficulty is `low | medium | hard` — different scale. */
export type ItemDifficulty = 'easy' | 'medium' | 'hard';

export interface AuthoringItem {
  id: string;
  setId: string;
  passageId: string | null;
  questionType: 'multiple_choice' | 'student_produced_response';
  subSkill: SubCompetency | null;
  /** A domain or skill code from `/skills`. Covers Math, which `subSkill` never could. */
  skillCode: string | null;
  difficulty: ItemDifficulty | null;
  subSkillSource: SubCompetencySource | null;
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

export async function fetchAuthoringBundles(): Promise<AuthoringBundle[]> {
  const { data } = await apiTransport.get<AuthoringBundle[]>('/teacher/question-sets');
  return data;
}

export async function addQuestionSet(payload: { title: string; subject: 'english' | 'math'; description: string; difficulty?: 'low' | 'medium' | 'hard' | null; isLiveExam?: boolean }): Promise<AuthoringBundle> {
  const { data } = await apiTransport.post<AuthoringBundle>('/teacher/question-sets', payload);
  return data;
}

/**
 * `isLiveExam` is editable here, not only at creation. Live sessions are offered
 * only sets carrying that flag, so without a way to set it on an existing set a
 * teacher has to re-author their whole paper to run one.
 */
export async function editQuestionSet(setId: string, payload: Partial<{ title: string; description: string; difficulty: 'low' | 'medium' | 'hard' | null; isLiveExam: boolean }>): Promise<AuthoringBundle> {
  const { data } = await apiTransport.put<AuthoringBundle>(`/teacher/question-sets/${setId}`, payload);
  return data;
}

export async function removeQuestionSet(setId: string): Promise<void> {
  await apiTransport.delete(`/teacher/question-sets/${setId}`);
}

export async function publishItemBundle(setId: string): Promise<AuthoringBundle> {
  const { data } = await apiTransport.post<AuthoringBundle>(`/teacher/question-sets/${setId}/publish`);
  return data;
}

export async function fetchSetPassages(setId: string): Promise<Extract[]> {
  const { data } = await apiTransport.get<Extract[]>(`/teacher/question-sets/${setId}/passages`);
  return data;
}

export async function addPassage(setId: string, payload: { title: string; passageText: string; orderIndex: number }): Promise<Extract> {
  const { data } = await apiTransport.post<Extract>(`/teacher/question-sets/${setId}/passages`, payload);
  return data;
}

export async function editPassage(passageId: string, payload: Partial<{ title: string; passageText: string }>): Promise<Extract> {
  const { data } = await apiTransport.put<Extract>(`/teacher/passages/${passageId}`, payload);
  return data;
}

export async function removePassage(passageId: string): Promise<void> {
  await apiTransport.delete(`/teacher/passages/${passageId}`);
}

export async function fetchSetQuestions(setId: string): Promise<AuthoringItem[]> {
  const { data } = await apiTransport.get<AuthoringItem[]>(`/teacher/question-sets/${setId}/questions`);
  return data;
}

/** `subSkill` is omitted too: tagging goes through `skillCode` now. */
export async function addItem(setId: string, payload: Omit<AuthoringItem, 'id' | 'setId' | 'subSkillSource' | 'subSkill'>): Promise<AuthoringItem> {
  const { data } = await apiTransport.post<AuthoringItem>(`/teacher/question-sets/${setId}/questions`, payload);
  return data;
}

export async function editQuestion(questionId: string, payload: Omit<AuthoringItem, 'id' | 'setId' | 'subSkillSource' | 'subSkill'>): Promise<AuthoringItem> {
  const { data } = await apiTransport.put<AuthoringItem>(`/teacher/questions/${questionId}`, payload);
  return data;
}

/** Confirm or override an AI-suggested tag. Takes a skill code, so Math is correctable. */
export async function editQuestionSubCompetency(
  questionId: string,
  payload: { skillCode?: string | null; subSkillSource: SubCompetencySource },
): Promise<AuthoringItem> {
  const { data } = await apiTransport.put<AuthoringItem>(`/teacher/questions/${questionId}/subskill`, payload);
  return data;
}

export async function removeQuestion(questionId: string): Promise<void> {
  await apiTransport.delete(`/teacher/questions/${questionId}`);
}

export interface ItemBundleImportBody {
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
    difficulty?: ItemDifficulty | null;
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

export async function ingestQuestionSetFromJSON(
  payload: ItemBundleImportBody,
): Promise<{ set: AuthoringBundle; questionCount: number; passageCount: number }> {
  const { data } = await apiTransport.post('/teacher/question-sets/import-json', payload);
  return data;
}
