import { desc, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { teacherVocabWords } from '../../core/db/schema';
import { notFound } from '../../core/errors';
import type { VocabWordInput } from './vocab.schemas';

/**
 * The teachers' shared vocabulary bank. Like content, it is a common library any
 * teacher may edit; students review these words through vocab.service.ts.
 */

export async function listVocabWords() {
  return db.select().from(teacherVocabWords).orderBy(desc(teacherVocabWords.createdAt));
}

export async function createVocabWord(input: VocabWordInput) {
  const [word] = await db
    .insert(teacherVocabWords)
    .values({
      word: input.word.trim(),
      definition: input.definition.trim(),
      exampleSentence: (input.exampleSentence ?? '').trim(),
    })
    .returning();
  return word;
}

export async function deleteVocabWord(wordId: string) {
  const [existing] = await db
    .select({ id: teacherVocabWords.id })
    .from(teacherVocabWords)
    .where(eq(teacherVocabWords.id, wordId))
    .limit(1);
  if (!existing) throw notFound('Word not found');
  // Cascades to every student's progress on this word.
  await db.delete(teacherVocabWords).where(eq(teacherVocabWords.id, wordId));
}
