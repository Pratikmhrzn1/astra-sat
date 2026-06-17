import { Router } from 'express';
import { z } from 'zod';
import { eq, sql, desc } from 'drizzle-orm';
import { db, pool } from '../db';
import {
  users,
  accessCodes,
  questionSets,
  questions,
  exams,
  examAnswers,
  mockTests,
  feedback,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { hashPassword } from '../lib/password';
import { runMigrations } from '../db/migrate';

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

export default router;
