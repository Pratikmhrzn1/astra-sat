import { apiClient } from '@/shared/api/http';

/** Vocabulary: the student's spaced-repetition deck and the teachers' word bank. */

export interface VocabDrillContent {
  word: string;
  sentenceContext: string;
  followUpQuestion: string;
  options: string[]; // exactly 4
  correctOption: string; // "A" | "B" | "C" | "D"
  explanation: string;
}

export interface VocabDueItemQuestion {
  source: 'question';
  vocabId: string;
  word: string;
  passageExcerpt: string;
  nextReviewAt: string;
  easeFactor: string;
  reviewCount: number;
  generatedContentId: string;
  content: VocabDrillContent;
}

export interface VocabDueItemTeacher {
  source: 'teacher';
  vocabId: string;
  word: string;
  definition: string;
  passageExcerpt: string;
  nextReviewAt: string | null;
  easeFactor: string;
  reviewCount: number;
}

export type VocabDueItem = VocabDueItemQuestion | VocabDueItemTeacher;

export async function getDueVocab(): Promise<VocabDueItem[]> {
  const { data } = await apiClient.get<VocabDueItem[]>('/student/vocab/due');
  return data;
}

export async function reviewVocab(
  vocabId: string,
  isCorrect: boolean,
): Promise<{ ok: boolean; nextReviewAt: string; intervalDays: number }> {
  const { data } = await apiClient.post(`/student/vocab/${vocabId}/review`, { isCorrect });
  return data;
}

export async function reviewTeacherVocab(wordId: string, isCorrect: boolean): Promise<void> {
  await apiClient.post(`/student/vocab/teacher/${wordId}/review`, { isCorrect });
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
