import { Router } from 'express';
import { z } from 'zod';
import { eq, sql, desc, isNull, and } from 'drizzle-orm';
import { db, pool } from '../db';
import {
  users,
  accessCodes,
  questionSets,
  questions,
  exams,
  examAnswers,
  aiFeedback,
  mockTests,
  feedback,
  generatedContent,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { hashPassword } from '../lib/password';
import { runMigrations } from '../db/migrate';
import { generateStructuredFeedback } from '../services/aiClient';

const router = Router();
router.use(requireAuth, requireRole(['admin']));

router.get('/stats', async (_req, res) => {
  try {
    const [
      studentCount,
      teacherCount,
      adminCount,
      examCount,
      questionCount,
      setCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'student')),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'teacher')),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'admin')),
      db.select({ count: sql<number>`count(*)::int` }).from(exams),
      db.select({ count: sql<number>`count(*)::int` }).from(questions),
      db.select({ count: sql<number>`count(*)::int` }).from(questionSets),
    ]);

    return res.json({
      students: studentCount[0].count,
      teachers: teacherCount[0].count,
      admins: adminCount[0].count,
      exams: examCount[0].count,
      questions: questionCount[0].count,
      questionSets: setCount[0].count,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', async (_req, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teacherId: users.teacherId,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.role, desc(users.createdAt));

    return res.json(allUsers);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  teacherId: z.string().uuid().nullable().optional(),
});

router.put('/users/:userId', validateBody(updateUserSchema), async (req, res) => {
  const { userId } = req.params;
  const { name, password, teacherId } = req.body;

  try {
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (teacherId !== undefined) updates.teacherId = teacherId;
    if (password !== undefined) updates.passwordHash = await hashPassword(password);

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teacherId: users.teacherId,
      });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const adminId = req.user!.sub;

  if (userId === adminId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const rows = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/access-codes', async (_req, res) => {
  try {
    const codes = await db
      .select({
        id: accessCodes.id,
        code: accessCodes.code,
        role: accessCodes.role,
        description: accessCodes.description,
        isActive: accessCodes.isActive,
        maxUses: accessCodes.maxUses,
        useCount: accessCodes.useCount,
        createdAt: accessCodes.createdAt,
        createdBy: accessCodes.createdBy,
      })
      .from(accessCodes)
      .orderBy(desc(accessCodes.createdAt));

    return res.json(codes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const createCodeSchema = z.object({
  code: z.string().min(4).max(50),
  role: z.enum(['student', 'teacher', 'admin']),
  description: z.string().max(500).optional().default(''),
  maxUses: z.number().int().positive().nullable().optional(),
});

router.post('/access-codes', validateBody(createCodeSchema), async (req, res) => {
  const createdBy = req.user!.sub;
  const { code, role, description, maxUses } = req.body;

  try {
    const existing = await db
      .select({ id: accessCodes.id })
      .from(accessCodes)
      .where(eq(accessCodes.code, code))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An access code with this value already exists' });
    }

    const [newCode] = await db
      .insert(accessCodes)
      .values({ code, role, description, createdBy, maxUses: maxUses ?? null })
      .returning();

    return res.status(201).json(newCode);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/access-codes/:codeId', async (req, res) => {
  const { codeId } = req.params;
  try {
    const rows = await db
      .delete(accessCodes)
      .where(eq(accessCodes.id, codeId))
      .returning({ id: accessCodes.id });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Access code not found' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/backup', async (_req, res) => {
  try {
    const [
      usersData,
      accessCodesData,
      questionSetsData,
      questionsData,
      examsData,
      examAnswersData,
      mockTestsData,
      feedbackData,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(accessCodes),
      db.select().from(questionSets),
      db.select().from(questions),
      db.select().from(exams),
      db.select().from(examAnswers),
      db.select().from(mockTests),
      db.select().from(feedback),
    ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        users: usersData,
        accessCodes: accessCodesData,
        questionSets: questionSetsData,
        questions: questionsData,
        exams: examsData,
        examAnswers: examAnswersData,
        mockTests: mockTestsData,
        feedback: feedbackData,
      },
    };

    const filename = `sat-prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json(backup);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const restoreSchema = z.object({
  version: z.number(),
  data: z.object({
    users: z.array(z.any()),
    accessCodes: z.array(z.any()),
    questionSets: z.array(z.any()),
    questions: z.array(z.any()),
    exams: z.array(z.any()),
    examAnswers: z.array(z.any()),
    mockTests: z.array(z.any()),
    feedback: z.array(z.any()),
  }),
});

router.post('/restore', validateBody(restoreSchema), async (req, res) => {
  const { data } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('SET CONSTRAINTS ALL DEFERRED');

    await client.query('TRUNCATE feedback, mock_tests, exam_answers, exams, questions, question_sets, access_codes, users CASCADE');

    const insertTable = async (tableName: string, rows: any[]) => {
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      const colStr = cols.map((c) => `"${c}"`).join(', ');
      for (const row of rows) {
        const vals = cols.map((c) => row[c]);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO ${tableName} (${colStr}) VALUES (${placeholders})`, vals);
      }
    };

    await insertTable('users', data.users);
    await insertTable('access_codes', data.accessCodes);
    await insertTable('question_sets', data.questionSets);
    await insertTable('questions', data.questions);
    await insertTable('exams', data.exams);
    await insertTable('exam_answers', data.examAnswers);
    await insertTable('mock_tests', data.mockTests);
    await insertTable('feedback', data.feedback);

    await client.query('COMMIT');
    return res.json({ ok: true, message: 'Database restored successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Restore error:', err);
    return res.status(500).json({ error: 'Restore failed', details: String(err) });
  } finally {
    client.release();
  }
});

router.post('/migrate', async (_req, res) => {
  try {
    await runMigrations();
    return res.json({ ok: true, message: 'Migrations completed successfully' });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: String(err) });
  }
});

// ── AI subSkill batch classification ─────────────────────────────────────────

const VALID_SUB_SKILLS = ['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions'] as const;
type ValidSubSkill = typeof VALID_SUB_SKILLS[number];

const CLASSIFY_SYSTEM_PROMPT = `You classify SAT Reading and Writing questions by sub-skill. Respond ONLY with a JSON object containing a single "classification" field. No markdown, no explanation, no preamble.

Valid classifications:
- "grammar" — tests mechanics: punctuation, subject-verb agreement, pronoun agreement, parallel structure, verb tense, modifier placement
- "inference" — tests comprehension: main idea, author purpose, tone, conclusions drawn from the passage
- "command_of_evidence" — tests textual support: "which choice best supports", selecting evidence, evaluating claims against the text
- "vocab_in_context" — tests word meaning: "as used in the passage X most nearly means", connotation, nuance
- "transitions" — tests rhetorical choice and flow: transition words (however, therefore), sentence ordering, adding/deleting sentences for cohesion
- "unclear" — genuinely does not fit any single category

Example response: {"classification":"grammar"}`;

function buildClassifyPrompt(q: { questionText: string; optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null; correctAnswer: string | null; explanation: string | null }): string {
  let prompt = `Classify this SAT Reading and Writing question:\n\nQuestion: ${q.questionText}`;
  if (q.optionA) {
    prompt += `\n\nOptions:\nA) ${q.optionA}\nB) ${q.optionB}\nC) ${q.optionC}\nD) ${q.optionD}`;
    if (q.correctAnswer) prompt += `\n\nCorrect answer: ${q.correctAnswer.toUpperCase()}`;
  }
  if (q.explanation) prompt += `\n\nExplanation: ${q.explanation}`;
  return prompt;
}

router.post('/questions/auto-tag-subskill', async (_req, res) => {
  const modelEnvKey = 'AI_MODEL_CLASSIFY';
  if (!process.env[modelEnvKey]) {
    return res.status(500).json({ error: `Missing env var: ${modelEnvKey}` });
  }

  try {
    const untagged = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        explanation: questions.explanation,
      })
      .from(questions)
      .innerJoin(questionSets, eq(questions.setId, questionSets.id))
      .where(and(eq(questionSets.subject, 'english'), isNull(questions.subSkill)));

    const totalFound = untagged.length;
    console.log(`[auto-tag] Found ${totalFound} untagged English questions`);

    let tagged = 0;
    let unclear = 0;
    let errors = 0;

    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 500;

    for (let i = 0; i < untagged.length; i += BATCH_SIZE) {
      const batch = untagged.slice(i, i + BATCH_SIZE);
      console.log(`[auto-tag] Batch ${Math.floor(i / BATCH_SIZE) + 1}: processing questions ${i + 1}–${i + batch.length}`);

      const results = await Promise.allSettled(
        batch.map(async (q) => {
          const userPrompt = buildClassifyPrompt(q);
          const result = await generateStructuredFeedback(CLASSIFY_SYSTEM_PROMPT, userPrompt, modelEnvKey);
          const classification = (result.parsed as Record<string, unknown>)?.classification;
          if (typeof classification === 'string' && (VALID_SUB_SKILLS as readonly string[]).includes(classification)) {
            await db
              .update(questions)
              .set({ subSkill: classification as ValidSubSkill, subSkillSource: 'ai_suggested' })
              .where(eq(questions.id, q.id));
            return 'tagged' as const;
          }
          return 'unclear' as const;
        }),
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value === 'tagged') tagged++;
          else unclear++;
        } else {
          errors++;
          console.error('[auto-tag] Question failed:', r.reason);
        }
      }

      if (i + BATCH_SIZE < untagged.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[auto-tag] Done — tagged: ${tagged}, unclear: ${unclear}, errors: ${errors}`);

    const migrationSql = [
      "-- Phase 1.5 migration SQL (run once against your Neon DB)",
      "CREATE TYPE sub_skill_source AS ENUM ('ai_suggested', 'human_confirmed');",
      "ALTER TABLE questions ADD COLUMN sub_skill_source sub_skill_source;",
    ].join('\n');

    return res.json({ totalFound, tagged, unclear, errors, migrationSql });
  } catch (err) {
    console.error('[auto-tag] Fatal error:', err);
    return res.status(500).json({ error: 'Classification run failed', details: String(err) });
  }
});

// ── Generated content quality gate ───────────────────────────────────────────

router.get('/generated-content', async (req, res) => {
  const { type, flag } = req.query as { type?: string; flag?: string };
  try {
    const conditions = [];
    if (type) conditions.push(eq(generatedContent.contentType, type as 'vocab_quiz' | 'skill_passage'));
    if (flag) conditions.push(eq(generatedContent.qualityFlag, flag as 'pending' | 'approved' | 'rejected'));

    const rows = await db
      .select({
        id: generatedContent.id,
        contentType: generatedContent.contentType,
        qualityFlag: generatedContent.qualityFlag,
        createdAt: generatedContent.createdAt,
        content: generatedContent.content,
        studentId: generatedContent.studentId,
        sourceQuestionId: generatedContent.sourceQuestionId,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
      })
      .from(generatedContent)
      .innerJoin(questions, eq(generatedContent.sourceQuestionId, questions.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(generatedContent.createdAt));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const flagSchema = z.object({
  qualityFlag: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
});

router.patch('/generated-content/:id/flag', validateBody(flagSchema), async (req, res) => {
  const { id } = req.params;
  const { qualityFlag, rejectionReason } = req.body;
  try {
    const existing = await db.select().from(generatedContent).where(eq(generatedContent.id, id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: 'Generated content not found' });
    const row = existing[0];

    // Fix B1: idempotency — re-approving an already-approved item would double-insert
    if (row.qualityFlag === 'approved' && qualityFlag === 'approved') {
      return res.json(row);
    }

    // On rejection: store reason, nothing promoted to live tables
    if (qualityFlag === 'rejected') {
      const [updated] = await db.update(generatedContent)
        .set({ qualityFlag, ...(rejectionReason ? { rejectionReason } : {}) })
        .where(eq(generatedContent.id, id))
        .returning();
      return res.json(updated);
    }

    // On approval of skill_passage: promote to live passages + questions tables
    if (qualityFlag === 'approved' && row.contentType === 'skill_passage') {
      type SkillPassageContent = {
        passage: { title: string; text: string; topic: string };
        questions: Array<{
          questionText: string;
          options: { A: string; B: string; C: string; D: string };
          correctAnswer: string;
          explanation: string;
          subSkill: string;
        }>;
        generationMeta: { targetSubSkill: string; difficultyLevel: string };
      };
      const content = row.content as SkillPassageContent;
      const subSkill = content.generationMeta?.targetSubSkill ?? 'unknown';

      // Fix B6: validate AI content before any DB writes to avoid orphaned passages
      const validAnswers = new Set(['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D']);
      for (const q of content.questions ?? []) {
        if (!q.correctAnswer || !validAnswers.has(q.correctAnswer)) {
          return res.status(422).json({ error: `Generated content has invalid correctAnswer: ${q.correctAnswer ?? 'null'}` });
        }
        if (!q.questionText || !q.options?.A || !q.options?.B || !q.options?.C || !q.options?.D) {
          return res.status(422).json({ error: 'Generated content is missing required question fields' });
        }
      }

      const setTitle = `AI Practice: ${subSkill.replace(/_/g, ' ')}`;

      // Fix B2: filter by generated=true so teacher-owned sets with matching titles are never touched
      const existingSet = await db.select({ id: questionSets.id })
        .from(questionSets)
        .where(and(eq(questionSets.title, setTitle), eq(questionSets.generated, true)))
        .limit(1);

      // Fix B3: wrap passage + question inserts in a transaction so no orphans on failure
      const client = await pool.connect();
      let setId: string;
      let updatedRow: typeof row;
      try {
        await client.query('BEGIN');

        if (existingSet.length > 0) {
          setId = existingSet[0].id;
        } else {
          const setRes = await client.query<{ id: string }>(
            `INSERT INTO question_sets (title, subject, description, generated)
             VALUES ($1, 'english', $2, true) RETURNING id`,
            [setTitle, `AI-generated practice passages for ${subSkill.replace(/_/g, ' ')} (Digital SAT module 2)`],
          );
          setId = setRes.rows[0].id;
        }

        const passRes = await client.query<{ id: string }>(
          `INSERT INTO passages (set_id, title, passage_text, generated, order_index)
           VALUES ($1, $2, $3, true, 0) RETURNING id`,
          [setId, content.passage.title ?? '', content.passage.text],
        );
        const passageId = passRes.rows[0].id;

        for (let i = 0; i < content.questions.length; i++) {
          const q = content.questions[i];
          const correctAnswerLower = q.correctAnswer.toLowerCase();
          await client.query(
            `INSERT INTO questions (set_id, passage_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, sub_skill, sub_skill_source, generated, order_index)
             VALUES ($1,$2,'multiple_choice',$3,$4,$5,$6,$7,$8,$9,$10,'ai_suggested',true,$11)`,
            [setId, passageId, q.questionText, q.options.A, q.options.B, q.options.C, q.options.D,
              correctAnswerLower, q.explanation ?? '', subSkill, i],
          );
        }

        const gcRes = await client.query<typeof row>(
          `UPDATE generated_content SET quality_flag='approved', live_set_id=$1 WHERE id=$2 RETURNING *`,
          [setId, id],
        );
        updatedRow = gcRes.rows[0];

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      return res.json({ ...updatedRow, liveSetId: setId });
    }

    // Default: approve vocab_quiz or any other type
    const [updated] = await db.update(generatedContent)
      .set({ qualityFlag })
      .where(eq(generatedContent.id, id))
      .returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── AI model performance stats ────────────────────────────────────────────────

router.get('/ai-model-stats', async (_req, res) => {
  try {
    const stats = await db
      .select({
        modelUsed: aiFeedback.modelUsed,
        totalCalls: sql<number>`count(*)::int`,
        avgLatencyMs: sql<number>`round(avg(${aiFeedback.latencyMs}))::int`,
        avgCostUsd: sql<string>`round(avg(${aiFeedback.costUsd}::numeric), 6)::text`,
        parseFailureRate: sql<number>`round(avg(CASE WHEN ${aiFeedback.parseFailed} THEN 1.0 ELSE 0.0 END)::numeric, 4)::float8`,
      })
      .from(aiFeedback)
      .groupBy(aiFeedback.modelUsed)
      .orderBy(desc(sql`count(*)`));

    return res.json(stats);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
