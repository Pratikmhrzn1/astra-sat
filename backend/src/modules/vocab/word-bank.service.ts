import { desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { teacherLexiconTable } from '../../core/db/schema';
import { missing } from '../../core/errors';
import type { LexiconWordPayload } from './vocab.schemas';

/**
 * The teachers' shared vocabulary bank. Like content, it is a common library any
 * teacher may edit; students review these words through vocab.service.ts.
 */

export async function collectLexiconWords() {
  return database.select().from(teacherLexiconTable).orderBy(desc(teacherLexiconTable.createdAt));
}

export async function addLexiconWord(input: LexiconWordPayload) {
  const [word] = await database
    .insert(teacherLexiconTable)
    .values({
      word: input.word.trim(),
      definition: input.definition.trim(),
      exampleSentence: (input.exampleSentence ?? '').trim(),
    })
    .returning();
  return word;
}

export async function removeLexiconWord(wordId: string) {
  const [existing] = await database
    .select({ id: teacherLexiconTable.id })
    .from(teacherLexiconTable)
    .where(eq(teacherLexiconTable.id, wordId))
    .limit(1);
  if (!existing) throw missing('Word not found');
  // Cascades to every student's progress on this word.
  await database.delete(teacherLexiconTable).where(eq(teacherLexiconTable.id, wordId));
}
