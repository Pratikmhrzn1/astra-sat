import { apiTransport } from '@/shared/api/http';

/** Vocabulary: the student's spaced-repetition deck and the teachers' word bank. */

export interface LexiconDrillContent {
  word: string;
  sentenceContext: string;
  followUpQuestion: string;
  options: string[]; // exactly 4
  correctOption: string; // "A" | "B" | "C" | "D"
  explanation: string;
}

export interface LexiconDueItemQuestion {
  source: 'question';
  vocabId: string;
  word: string;
  passageExcerpt: string;
  nextReviewAt: string;
  easeFactor: string;
  reviewCount: number;
  generatedContentId: string;
  content: LexiconDrillContent;
}

export interface LexiconDueItemTeacher {
  source: 'teacher';
  vocabId: string;
  word: string;
  definition: string;
  passageExcerpt: string;
  nextReviewAt: string | null;
  easeFactor: string;
  reviewCount: number;
}

export type LexiconDueItem = LexiconDueItemQuestion | LexiconDueItemTeacher;

export async function fetchDueLexicon(): Promise<LexiconDueItem[]> {
  const { data } = await apiTransport.get<LexiconDueItem[]>('/student/vocab/due');
  return data;
}

export async function reviewLexicon(
  vocabId: string,
  isCorrect: boolean,
): Promise<{ ok: boolean; nextReviewAt: string; intervalDays: number }> {
  const { data } = await apiTransport.post(`/student/vocab/${vocabId}/review`, { isCorrect });
  return data;
}

export async function reviewTeacherLexicon(wordId: string, isCorrect: boolean): Promise<void> {
  await apiTransport.post(`/student/vocab/teacher/${wordId}/review`, { isCorrect });
}

export interface TeacherLexiconWord {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  createdAt: string;
}

export async function fetchTeacherLexiconWords(): Promise<TeacherLexiconWord[]> {
  const { data } = await apiTransport.get<TeacherLexiconWord[]>('/teacher/vocab-words');
  return data;
}

export async function addTeacherLexiconWord(payload: { word: string; definition: string; exampleSentence?: string }): Promise<TeacherLexiconWord> {
  const { data } = await apiTransport.post<TeacherLexiconWord>('/teacher/vocab-words', payload);
  return data;
}

export async function removeTeacherLexiconWord(wordId: string): Promise<void> {
  await apiTransport.delete(`/teacher/vocab-words/${wordId}`);
}
