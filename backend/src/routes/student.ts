import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, desc, lte, ne, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { users, questionSets, questions, passages, exams, examAnswers, aiFeedback, mockTests, feedback, studentVocab, generatedContent, mockNarratives, studentSkillTriggers, chatSessions, chatMessages, teacherVocabWords, studentTeacherVocabProgress } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { normalizeFileUrl } from '../lib/url';
import { validateBody } from '../middleware/validate';
import {
  FeedbackContext,
  FeedbackType,
  getApplicableFeedbackTypes,
  orchestrateConfirmFeedback,
  extractVocabWord,
  extractSentenceWithWord,
  generateStructuredFeedback,
  generateChatResponse,
} from '../services/aiClient';

// ── Per-user AI request rate limiter ─────────────────────────────────────────
// 300 AI calls per user per rolling 15-minute window. Each /confirm fires up to
// 3 parallel AI calls; each /chat fires 1. The counter tracks actual AI calls
// dispatched, not HTTP requests.

const AI_RATE_LIMIT = 300;
const AI_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AiRateRecord {
  count: number;
  windowStart: number; // epoch ms
}
const aiRateMap = new Map<string, AiRateRecord>();

function checkAiRateLimit(userId: string, cost: number): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  let rec = aiRateMap.get(userId);

  if (!rec || now - rec.windowStart >= AI_RATE_WINDOW_MS) {
    // Window expired or first call — start fresh
    rec = { count: 0, windowStart: now };
    aiRateMap.set(userId, rec);
  }

  if (rec.count + cost > AI_RATE_LIMIT) {
    const retryAfterSeconds = Math.ceil((rec.windowStart + AI_RATE_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  rec.count += cost;
  return { allowed: true };
}

// ── Phase 8: Weak-skill passage generation ────────────────────────────────────
// Fires async after confirm response — never blocks the student session.

async function generateSkillPassageAsync(
  studentId: string,
  subSkill: string,
  exampleQuestions: string[],
  sourceQuestionId: string,
): Promise<void> {
  try {
    const subSkillLabel = subSkill.replace(/_/g, ' ');
    const examplesBlock = exampleQuestions
      .slice(0, 3)
      .map((q, i) => `Example ${i + 1}: "${q}"`)
      .join('\n');

    const systemPrompt = `You are generating a Digital SAT practice passage and questions for a student who struggles with ${subSkillLabel} questions.

Return ONLY valid JSON, no markdown fences:
{
  "passage": {
    "title": "short descriptive title",
    "text": "150-250 words, wholly original prose — fiction, essay, or analytical writing on any topic",
    "topic": "e.g. ecology, history, literary criticism"
  },
  "questions": [
    {
      "questionText": "full question text",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "A",
      "explanation": "1-2 sentences explaining why the correct answer is right",
      "subSkill": "${subSkill}"
    }
  ],
  "generationMeta": {
    "targetSubSkill": "${subSkill}",
    "difficultyLevel": "module_2"
  }
}

Rules:
- passage.text must be 150-250 words — count carefully.
- Generate EXACTLY 2 questions in the questions array — no more, no less.
- questions[n].subSkill must be exactly "${subSkill}".
- DO NOT reference or mimic College Board passages. DO NOT copy academic paper abstracts verbatim. The passage must be fictional or clearly original creative/analytical writing.
- correctAnswer must be exactly "A", "B", "C", or "D".
- Target difficulty: Digital SAT module 2 (harder questions, subtler distractors).`;

    const userPrompt = `SubSkill to target: ${subSkillLabel}

Example questions this student got wrong (style reference only — do not copy or echo these questions):
${examplesBlock}

Generate a wholly original passage and exactly 2 questions testing ${subSkillLabel}.`;

    const result = await generateStructuredFeedback(systemPrompt, userPrompt, 'AI_MODEL_NARRATIVE');

    // Human review required before student sees this — write as 'pending'
    await db.insert(generatedContent).values({
      contentType: 'skill_passage',
      sourceQuestionId,
      studentId,
      content: result.parsed as Record<string, unknown>,
      qualityFlag: 'pending',
    });
  } catch (err) {
    console.error('[skill-passage] Generation error for subSkill', subSkill, ':', err);
  }
}

async function checkAndTriggerSkillPassage(
  studentId: string,
  subSkill: string,
  currentQuestionText: string,
  currentQuestionId: string,
): Promise<void> {
  // Count total wrong answers for this student+subSkill across all practice sessions
  const [{ wrongCount }] = await db
    .select({ wrongCount: sql<number>`count(*)::int` })
    .from(examAnswers)
    .innerJoin(exams, eq(examAnswers.examId, exams.id))
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(and(
      eq(exams.studentId, studentId),
      eq(exams.type, 'individual'),
      eq(questions.subSkill, subSkill as 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions'),
      eq(examAnswers.isCorrect, false),
    ));

  // Only fire on multiples of 3
  if (wrongCount === 0 || wrongCount % 3 !== 0) return;

  const expectedTriggerCount = wrongCount / 3;

  // Atomic upsert: only advances trigger_count if still below the new threshold.
  // The WHERE on DO UPDATE means concurrent requests return 0 rows — only one fires.
  const upserted = await db.execute(
    sql`INSERT INTO student_skill_triggers (student_id, sub_skill, trigger_count, last_triggered_at)
        VALUES (${studentId}, ${subSkill}, ${expectedTriggerCount}, now())
        ON CONFLICT (student_id, sub_skill)
        DO UPDATE SET
          trigger_count = EXCLUDED.trigger_count,
          last_triggered_at = now()
        WHERE student_skill_triggers.trigger_count < EXCLUDED.trigger_count
        RETURNING id`,
  );
  if (!upserted.rows.length) return; // Concurrent request already claimed this threshold

  // Fetch up to 2 additional recent wrong questions as style context
  const moreRows = await db
    .select({ questionText: questions.questionText })
    .from(examAnswers)
    .innerJoin(exams, eq(examAnswers.examId, exams.id))
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(and(
      eq(exams.studentId, studentId),
      eq(exams.type, 'individual'),
      eq(questions.subSkill, subSkill as 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions'),
      eq(examAnswers.isCorrect, false),
      ne(questions.id, currentQuestionId),
    ))
    .orderBy(desc(examAnswers.answeredAt))
    .limit(2);

  const exampleTexts = [currentQuestionText, ...moreRows.map((r) => r.questionText)];

  generateSkillPassageAsync(studentId, subSkill, exampleTexts, currentQuestionId).catch((e) => {
    console.error('[skill-passage] Background generation failed:', e);
  });
}

// ── Mock-test narrative (Phase 9) ─────────────────────────────────────────────
// Runs entirely in background after submit returns. Never blocks the student.

async function generateNarrativeAsync(
  examId: string,
  narrativeId: string,
  exam: { type: string; score: number | null; totalQuestions: number; timeSpentSeconds: number | null; setId: string },
): Promise<void> {
  try {
    // Aggregate per-subSkill wrong counts across all exam answers
    const subSkillStats = await db
      .select({
        subSkill: questions.subSkill,
        total: sql<number>`count(*)::int`,
        wrong: sql<number>`count(*) filter (where ${examAnswers.isCorrect} = false)::int`,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, examId))
      .groupBy(questions.subSkill);

    // Derive section label from exam type; fall back to set subject for individual exams
    let section: string;
    if (exam.type === 'mock_english') {
      section = 'English (Reading & Writing)';
    } else if (exam.type === 'mock_math') {
      section = 'Math';
    } else {
      const [setRow] = await db.select({ subject: questionSets.subject }).from(questionSets).where(eq(questionSets.id, exam.setId)).limit(1);
      section = setRow?.subject === 'english' ? 'English (Reading & Writing)' : 'Math';
    }
    const totalRight = exam.score ?? 0;
    const totalWrong = exam.totalQuestions - totalRight;
    const timeMin = exam.timeSpentSeconds ? Math.round(exam.timeSpentSeconds / 60) : null;

    const breakdown = subSkillStats.map(({ subSkill, total, wrong }) => ({
      subSkill: subSkill ?? 'untagged',
      total,
      wrong,
      flag: wrong >= 3,
    }));

    const systemPrompt = `You are a candid SAT diagnostic coach. A student just completed a ${section} section mock test. Analyze their performance data and return a JSON diagnostic.

Return ONLY valid JSON, no markdown:
{
  "scoreRange": "<estimated range e.g. '620–660', or null if you cannot reliably estimate>",
  "primaryGap": "<the single subSkill with the most missed questions>",
  "narrative": "<3–4 sentences. Lead with the honest pattern — no opening compliment. Cite actual numbers from the test (e.g. 'you missed 5 of 8 inference questions'). End with one specific, actionable next step.>",
  "subSkillBreakdown": [{ "subSkill": "...", "wrong": <n>, "total": <n>, "flag": <boolean> }]
}

scoreRange: base on actual wrong-per-subSkill ratios. Set to null if your estimate would be unreliable — a wrong number is worse than no number.
narrative: plain language, no encouragement filler, reference exact numbers, one concrete next step at the end.
subSkillBreakdown: include every subSkill that appeared; flag = true when wrong >= 3.`;

    const userPrompt = `Section: ${section}
Score: ${totalRight} correct, ${totalWrong} wrong of ${exam.totalQuestions} total${timeMin !== null ? `\nTime: ${timeMin} minutes` : ''}

SubSkill breakdown:
${breakdown.map((b) => `- ${b.subSkill}: ${b.wrong} wrong of ${b.total}${b.flag ? ' [PATTERN]' : ''}`).join('\n')}`;

    const result = await generateStructuredFeedback(systemPrompt, userPrompt, 'AI_MODEL_NARRATIVE');

    await db.update(mockNarratives).set({
      content: result.parsed as Record<string, unknown>,
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      costUsd: String(result.costUsd),
      status: 'complete',
    }).where(eq(mockNarratives.id, narrativeId));

  } catch (err) {
    console.error('[narrative] Generation failed for exam', examId, ':', err);
    await db.update(mockNarratives)
      .set({ status: 'failed' })
      .where(eq(mockNarratives.id, narrativeId))
      .catch((e) => console.error('[narrative] Failed to mark failed:', e));
  }
}

const router = Router();
router.use(requireAuth, requireRole(['student']));

// Parse a fraction or decimal string to a number for SPR comparison
function parseSPRValue(s: string): number | null {
  const t = s.trim();
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const den = parseInt(frac[2]);
    return den === 0 ? null : parseInt(frac[1]) / den;
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function sprIsCorrect(student: string, correct: string): boolean {
  if (student.trim().toLowerCase() === correct.trim().toLowerCase()) return true;
  const sv = parseSPRValue(student);
  const cv = parseSPRValue(correct);
  if (sv !== null && cv !== null) return Math.abs(sv - cv) < 0.001;
  return false;
}

// Question fields returned to the student (no correct answer revealed)
const questionSelect = {
  id: questions.id,
  questionType: questions.questionType,
  questionText: questions.questionText,
  optionA: questions.optionA,
  optionB: questions.optionB,
  optionC: questions.optionC,
  optionD: questions.optionD,
  imageUrl: questions.imageUrl,
  passageId: questions.passageId,
  passageText: passages.passageText,
  passageTitle: passages.title,
  orderIndex: questions.orderIndex,
};

router.get('/question-sets', async (_req, res) => {
  try {
    const sets = await db
      .select({
        id: questionSets.id,
        title: questionSets.title,
        subject: questionSets.subject,
        description: questionSets.description,
        createdAt: questionSets.createdAt,
        questionCount: sql<number>`(SELECT COUNT(*) FROM questions WHERE questions.set_id = question_sets.id)::int`,
      })
      .from(questionSets)
      .where(and(eq(questionSets.isDraft, false), eq(questionSets.isLiveExam, false)))
      .orderBy(desc(questionSets.createdAt));
    return res.json(sets);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/question-sets/:setId', async (req, res) => {
  try {
    const setRows = await db.select().from(questionSets)
      .where(eq(questionSets.id, req.params.setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });
    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, req.params.setId))
      .orderBy(questions.orderIndex);
    return res.json({ ...setRows[0], questions: qs.map((q) => ({ ...q, imageUrl: normalizeFileUrl(q.imageUrl) })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const startExamSchema = z.object({
  setId: z.string().uuid('Invalid set ID'),
  type: z.enum(['individual']).default('individual'),
});

router.post('/exams', validateBody(startExamSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { setId, type } = req.body;
  try {
    const setRows = await db.select().from(questionSets).where(eq(questionSets.id, setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });

    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, setId))
      .orderBy(questions.orderIndex);

    if (qs.length === 0) return res.status(400).json({ error: 'This question set has no questions' });

    const [exam] = await db.insert(exams).values({ studentId, setId, type, totalQuestions: qs.length }).returning();
    await db.insert(examAnswers).values(qs.map((q) => ({ examId: exam.id, questionId: q.id })));
    return res.status(201).json({ exam, questions: qs.map((q) => ({ ...q, imageUrl: normalizeFileUrl(q.imageUrl) })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .select({ id: exams.id, setId: exams.setId, type: exams.type, status: exams.status, score: exams.score, totalQuestions: exams.totalQuestions, startedAt: exams.startedAt, completedAt: exams.completedAt, setTitle: questionSets.title, subject: questionSets.subject })
      .from(exams).innerJoin(questionSets, eq(exams.setId, questionSets.id))
      .where(eq(exams.studentId, studentId)).orderBy(desc(exams.startedAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const exam = examRows[0];
    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, exam.setId))
      .orderBy(questions.orderIndex);

    const answers = await db
      .select({ questionId: examAnswers.questionId, selectedAnswer: examAnswers.selectedAnswer, selectedAnswerText: examAnswers.selectedAnswerText, answeredAt: examAnswers.answeredAt })
      .from(examAnswers).where(eq(examAnswers.examId, exam.id));

    // For mock exams, find the sibling section so the frontend can chain / combine results
    let mathExamId: string | null = null;
    let englishExamId: string | null = null;
    if (exam.type === 'mock_english') {
      const mtRows = await db.select({ mathExamId: mockTests.mathExamId })
        .from(mockTests).where(eq(mockTests.englishExamId, exam.id)).limit(1);
      if (mtRows.length > 0) mathExamId = mtRows[0].mathExamId ?? null;
    }
    if (exam.type === 'mock_math') {
      const mtRows = await db.select({ englishExamId: mockTests.englishExamId })
        .from(mockTests).where(eq(mockTests.mathExamId, exam.id)).limit(1);
      if (mtRows.length > 0) englishExamId = mtRows[0].englishExamId ?? null;
    }

    return res.json({ exam, questions: qs.map((q) => ({ ...q, imageUrl: normalizeFileUrl(q.imageUrl) })), answers, mathExamId, englishExamId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const saveAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
    selectedAnswerText: z.string().max(200).nullable().optional(),
  })),
  timeSpentSeconds: z.number().int().optional(),
});

router.put('/exams/:examId/answers', validateBody(saveAnswersSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { answers, timeSpentSeconds } = req.body;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (examRows[0].status === 'completed') return res.status(400).json({ error: 'Exam already completed' });

    for (const ans of answers) {
      const hasAnswer = ans.selectedAnswer != null || (ans.selectedAnswerText && ans.selectedAnswerText.trim() !== '');
      await db.update(examAnswers).set({
        selectedAnswer: ans.selectedAnswer ?? null,
        selectedAnswerText: ans.selectedAnswerText ?? null,
        answeredAt: hasAnswer ? new Date() : null,
      }).where(and(eq(examAnswers.examId, req.params.examId), eq(examAnswers.questionId, ans.questionId)));
    }

    if (timeSpentSeconds !== undefined) {
      await db.update(exams).set({ timeSpentSeconds }).where(eq(exams.id, req.params.examId));
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Practice mode: per-question confirm ──────────────────────────────────────

const confirmSchema = z.object({
  selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
  selectedAnswerText: z.string().max(200).nullable().optional(),
  confidence: z.enum(['sure', 'eliminated', 'guessed']),
  reasoning: z.string().max(1000).optional(),
});

router.post('/exams/:examId/questions/:questionId/confirm', validateBody(confirmSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { examId, questionId } = req.params;
  const { selectedAnswer, selectedAnswerText, confidence, reasoning } = req.body;

  try {
    // Verify exam belongs to student and is practice mode only
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.type !== 'individual') return res.status(400).json({ error: 'Confirm is only available in practice mode' });

    // Fetch question with passage and set subject — both needed for trap_explainer routing
    const qRows = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
        subSkill: questions.subSkill,
        passageText: passages.passageText,
        subject: questionSets.subject,
      })
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .innerJoin(questionSets, eq(questions.setId, questionSets.id))
      .where(and(eq(questions.id, questionId), eq(questions.setId, exam.setId)))
      .limit(1);
    if (qRows.length === 0) return res.status(404).json({ error: 'Question not found' });
    const q = qRows[0];

    // Get the examAnswer row
    const answerRows = await db.select().from(examAnswers)
      .where(and(eq(examAnswers.examId, examId), eq(examAnswers.questionId, questionId))).limit(1);
    if (answerRows.length === 0) return res.status(404).json({ error: 'Answer record not found' });
    const answerRow = answerRows[0];

    // For completed exams: use stored answer/result without mutating DB
    let isCorrect: boolean;
    let effectiveAnswer: string | null;
    let effectiveAnswerText: string | null;

    if (exam.status !== 'completed') {
      const hasAnswer = selectedAnswer != null || (selectedAnswerText && selectedAnswerText.trim() !== '');
      await db.update(examAnswers).set({
        selectedAnswer: selectedAnswer ?? null,
        selectedAnswerText: selectedAnswerText ?? null,
        answeredAt: hasAnswer ? new Date() : null,
      }).where(eq(examAnswers.id, answerRow.id));

      if (q.questionType === 'student_produced_response') {
        isCorrect = selectedAnswerText ? sprIsCorrect(selectedAnswerText, q.correctAnswerText ?? '') : false;
      } else {
        isCorrect = selectedAnswer != null && selectedAnswer === q.correctAnswer;
      }
      await db.update(examAnswers).set({ isCorrect }).where(eq(examAnswers.id, answerRow.id));
      effectiveAnswer = selectedAnswer ?? null;
      effectiveAnswerText = selectedAnswerText ?? null;
    } else {
      isCorrect = answerRow.isCorrect ?? false;
      effectiveAnswer = answerRow.selectedAnswer;
      effectiveAnswerText = answerRow.selectedAnswerText;
    }

    // Build the feedback context once — shared by all prompt builders
    const ctx: FeedbackContext = {
      questionText: q.questionText,
      questionType: q.questionType,
      subSkill: q.subSkill ?? null,
      subject: q.subject,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer ?? null,
      correctAnswerText: q.correctAnswerText ?? null,
      selectedAnswer: effectiveAnswer,
      selectedAnswerText: effectiveAnswerText,
      isCorrect,
      confidence,
      reasoning: reasoning ?? null,
      passageText: q.passageText ?? null,
    };

    // Determine which types apply for this question+answer combination
    const applicableTypes = getApplicableFeedbackTypes(ctx);

    // Check cache for all applicable types in one query
    const cachedRows = await db
      .select({ feedbackType: aiFeedback.feedbackType, content: aiFeedback.content })
      .from(aiFeedback)
      .where(eq(aiFeedback.examAnswerId, answerRow.id));
    const cachedByType = new Map<string, unknown>(cachedRows.map((r) => [r.feedbackType, r.content]));

    // Only fire AI for types not already in cache
    const uncachedTypes = applicableTypes.filter((t) => !cachedByType.has(t)) as FeedbackType[];

    if (uncachedTypes.length > 0) {
      // Charge the exact number of AI calls about to fire, not the theoretical max
      const aiCheck = checkAiRateLimit(studentId, uncachedTypes.length);
      if (!aiCheck.allowed) {
        return res.status(429).json({
          error: `AI request limit reached. Please wait ${Math.ceil(aiCheck.retryAfterSeconds! / 60)} minute${Math.ceil(aiCheck.retryAfterSeconds! / 60) === 1 ? '' : 's'} before confirming more answers.`,
          retryAfterSeconds: aiCheck.retryAfterSeconds,
        });
      }

      // All uncached calls run in parallel — Promise.all, not sequential awaits
      const results = await orchestrateConfirmFeedback(ctx, uncachedTypes);

      // Write each successful result independently; failures are already caught inside orchestrateConfirmFeedback
      await Promise.all(
        results
          .filter((r) => r.aiResult !== null)
          .map((r) =>
            db.insert(aiFeedback).values({
              examAnswerId: answerRow.id,
              feedbackType: r.feedbackType as FeedbackType,
              content: r.aiResult!.parsed as Record<string, unknown>,
              modelUsed: r.aiResult!.modelUsed,
              latencyMs: r.aiResult!.latencyMs,
              promptTokens: r.aiResult!.promptTokens,
              completionTokens: r.aiResult!.completionTokens,
              costUsd: String(r.aiResult!.costUsd),
              parseFailed: r.aiResult!.parseFailed,
            }),
          ),
      );

      // Merge new results into the cache map for response building
      for (const r of results) {
        if (r.aiResult) cachedByType.set(r.feedbackType, r.aiResult.parsed);
      }
    }

    // Quality gate + vocab tracking for vocab_drill
    let vocabTrackingId: string | null = null;
    const vocabContent = cachedByType.get('vocab_drill') as Record<string, unknown> | undefined;
    if (vocabContent && q.subSkill === 'vocab_in_context') {
      // Only insert a generated_content row when the AI actually ran (not on cache hit)
      const existingGc = await db.select({ id: generatedContent.id })
        .from(generatedContent)
        .where(and(
          eq(generatedContent.sourceQuestionId, questionId),
          eq(generatedContent.studentId, studentId),
          eq(generatedContent.contentType, 'vocab_quiz'),
        ))
        .limit(1);

      let gcId: string;
      if (existingGc.length > 0) {
        gcId = existingGc[0].id;
      } else {
        const [gcRow] = await db.insert(generatedContent).values({
          contentType: 'vocab_quiz',
          sourceQuestionId: questionId,
          studentId,
          content: vocabContent,
          qualityFlag: 'pending',
        }).returning({ id: generatedContent.id });
        gcId = gcRow.id;
      }
      void gcId;

      // Create studentVocab row on first encounter of this word for this student
      const word = extractVocabWord(q.questionText);
      if (word) {
        const existing = await db
          .select({ id: studentVocab.id })
          .from(studentVocab)
          .where(and(eq(studentVocab.studentId, studentId), eq(studentVocab.word, word)))
          .limit(1);

        if (existing.length === 0) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const [newVocab] = await db.insert(studentVocab).values({
            studentId,
            questionId,
            word,
            passageExcerpt: extractSentenceWithWord(q.passageText ?? '', word),
            nextReviewAt: tomorrow,
          }).returning({ id: studentVocab.id });
          vocabTrackingId = newVocab.id;
        } else {
          vocabTrackingId = existing[0].id;
        }
      }

    }

    // Build response — only applicable types, null for any that failed
    const feedbacks: Record<string, unknown> = {};
    for (const t of applicableTypes) {
      feedbacks[t] = cachedByType.get(t) ?? null;
    }

    // Respond immediately — threshold check runs after
    res.json({ isCorrect, feedbacks, vocabTrackingId });

    // Phase 8: weak-skill threshold check — non-blocking, never delays the student
    if (!isCorrect && q.subSkill) {
      checkAndTriggerSkillPassage(studentId, q.subSkill, q.questionText, questionId).catch((e) => {
        console.error('[skill-passage] Trigger check failed:', e);
      });
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

const submitSchema = z.object({ timeSpentSeconds: z.number().int().optional() });

router.post('/exams/:examId/submit', validateBody(submitSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { timeSpentSeconds } = req.body;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status === 'completed') return res.status(400).json({ error: 'Exam already completed' });

    const answersWithQuestions = await db
      .select({
        answerId: examAnswers.id,
        questionType: questions.questionType,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id));

    let score = 0;
    for (const row of answersWithQuestions) {
      let isCorrect: boolean;
      if (row.questionType === 'student_produced_response') {
        isCorrect = row.selectedAnswerText
          ? sprIsCorrect(row.selectedAnswerText, row.correctAnswerText ?? '')
          : false;
      } else {
        isCorrect = row.selectedAnswer !== null && row.selectedAnswer === row.correctAnswer;
      }
      if (isCorrect) score++;
      const hasAnswer = row.selectedAnswer != null || (row.selectedAnswerText && row.selectedAnswerText.trim() !== '');
      await db.update(examAnswers).set({ isCorrect, answeredAt: hasAnswer ? new Date() : null })
        .where(eq(examAnswers.id, row.answerId));
    }

    const [updated] = await db.update(exams).set({
      status: 'completed', score, completedAt: new Date(),
      timeSpentSeconds: timeSpentSeconds ?? exam.timeSpentSeconds,
    }).where(eq(exams.id, exam.id)).returning();

    // Insert pending narrative row synchronously before responding
    let narrativeId: string | null = null;
    if (process.env.AI_MODEL_NARRATIVE) {
      const [narrativeRow] = await db.insert(mockNarratives)
        .values({ examId: exam.id })
        .returning({ id: mockNarratives.id });
      narrativeId = narrativeRow.id;
    }

    // Respond immediately — student does not wait for the AI call
    res.json({ score, total: exam.totalQuestions, percentage: Math.round((score / exam.totalQuestions) * 100), exam: updated });

    // Fire background narrative generation — intentionally non-awaited
    if (narrativeId) {
      generateNarrativeAsync(exam.id, narrativeId, updated).catch((err) => {
        console.error('[narrative] Unhandled top-level error:', err);
      });
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId/results', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status !== 'completed') return res.status(400).json({ error: 'Exam not yet completed' });

    const results = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        questionText: questions.questionText,
        optionA: questions.optionA, optionB: questions.optionB, optionC: questions.optionC, optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
        explanation: questions.explanation,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        isCorrect: examAnswers.isCorrect,
        orderIndex: questions.orderIndex,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id))
      .orderBy(questions.orderIndex);

    const setRows = await db.select({ title: questionSets.title, subject: questionSets.subject })
      .from(questionSets).where(eq(questionSets.id, exam.setId)).limit(1);

    return res.json({ exam, set: setRows[0] || null, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/skill-passages/available', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const triggers = await db.select({ subSkill: studentSkillTriggers.subSkill })
      .from(studentSkillTriggers)
      .where(eq(studentSkillTriggers.studentId, studentId));

    if (triggers.length === 0) return res.json([]);

    const studentSubSkills = new Set(triggers.map((t) => t.subSkill));

    // Fetch approved skill_passages scoped to this student only (fix: was global)
    const approved = await db.select({
      id: generatedContent.id,
      content: generatedContent.content,
      liveSetId: generatedContent.liveSetId,
    })
      .from(generatedContent)
      .where(and(
        eq(generatedContent.contentType, 'skill_passage'),
        eq(generatedContent.qualityFlag, 'approved'),
        eq(generatedContent.studentId, studentId),
        isNotNull(generatedContent.liveSetId),
      ));

    // Return one entry per subSkill (first approved wins) — only subSkills this student has triggered
    const seen = new Set<string>();
    const result: { subSkill: string; setId: string; generatedContentId: string }[] = [];
    for (const row of approved) {
      const subSkill = (row.content as Record<string, unknown> & { generationMeta?: { targetSubSkill?: string } })
        ?.generationMeta?.targetSubSkill;
      if (!subSkill || !studentSubSkills.has(subSkill) || seen.has(subSkill)) continue;
      seen.add(subSkill);
      result.push({ subSkill, setId: row.liveSetId!, generatedContentId: row.id });
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId/narrative', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db.select({ id: exams.id })
      .from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const narrativeRows = await db.select()
      .from(mockNarratives)
      .where(eq(mockNarratives.examId, req.params.examId))
      .limit(1);
    if (narrativeRows.length === 0) return res.status(404).json({ error: 'Narrative not found' });

    return res.json(narrativeRows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/exams/:examId/narrative/retry', async (req, res) => {
  const studentId = req.user!.sub;
  if (!process.env.AI_MODEL_NARRATIVE) return res.status(503).json({ error: 'Narrative model not configured' });
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status !== 'completed') return res.status(400).json({ error: 'Exam not completed' });

    // Upsert narrative row — reset to pending if it exists, create if not
    const existing = await db.select({ id: mockNarratives.id })
      .from(mockNarratives).where(eq(mockNarratives.examId, exam.id)).limit(1);

    let narrativeId: string;
    if (existing.length > 0) {
      await db.update(mockNarratives)
        .set({ status: 'pending', content: {}, modelUsed: '', latencyMs: null, costUsd: null })
        .where(eq(mockNarratives.id, existing[0].id));
      narrativeId = existing[0].id;
    } else {
      const [row] = await db.insert(mockNarratives).values({ examId: exam.id }).returning({ id: mockNarratives.id });
      narrativeId = row.id;
    }

    res.json({ ok: true });

    generateNarrativeAsync(exam.id, narrativeId, exam).catch((err) => {
      console.error('[narrative-retry] Unhandled error:', err);
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    // Pick math set first, then choose English with opposing difficulty
    const mathSetRows = await db.execute(sql`SELECT id, difficulty FROM question_sets WHERE subject = 'math' ORDER BY RANDOM() LIMIT 1`);
    if (mathSetRows.rows.length === 0) return res.status(400).json({ error: 'No Math question sets available' });

    const mathSetId = (mathSetRows.rows[0] as any).id;
    const mathDifficulty: string | null = (mathSetRows.rows[0] as any).difficulty ?? null;

    // Opposing difficulty matrix: LOW↔HARD, MEDIUM→random extreme
    let opposingDifficulty: string | null = null;
    if (mathDifficulty === 'low') opposingDifficulty = 'hard';
    else if (mathDifficulty === 'hard') opposingDifficulty = 'low';
    else if (mathDifficulty === 'medium') opposingDifficulty = Math.random() < 0.5 ? 'low' : 'hard';

    // Try opposing difficulty first, fallback to any English set
    let englishSetRows = opposingDifficulty
      ? await db.execute(sql`SELECT id FROM question_sets WHERE subject = 'english' AND difficulty = ${opposingDifficulty} ORDER BY RANDOM() LIMIT 1`)
      : { rows: [] };
    if (englishSetRows.rows.length === 0) {
      englishSetRows = await db.execute(sql`SELECT id FROM question_sets WHERE subject = 'english' ORDER BY RANDOM() LIMIT 1`);
    }
    if (englishSetRows.rows.length === 0) return res.status(400).json({ error: 'No English question sets available' });

    const englishSetId = (englishSetRows.rows[0] as any).id;

    const englishQs = await db.select(questionSelect).from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, englishSetId)).orderBy(questions.orderIndex);
    const mathQs = await db.select(questionSelect).from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, mathSetId)).orderBy(questions.orderIndex);

    const [englishExam] = await db.insert(exams).values({ studentId, setId: englishSetId, type: 'mock_english', totalQuestions: englishQs.length }).returning();
    const [mathExam] = await db.insert(exams).values({ studentId, setId: mathSetId, type: 'mock_math', totalQuestions: mathQs.length }).returning();
    if (englishQs.length > 0) await db.insert(examAnswers).values(englishQs.map((q) => ({ examId: englishExam.id, questionId: q.id })));
    if (mathQs.length > 0) await db.insert(examAnswers).values(mathQs.map((q) => ({ examId: mathExam.id, questionId: q.id })));

    const [mockTest] = await db.insert(mockTests).values({ studentId, englishExamId: englishExam.id, mathExamId: mathExam.id }).returning();
    return res.status(201).json({ mockTest, englishExam, mathExam, englishQuestions: englishQs.map((q) => ({ ...q, imageUrl: normalizeFileUrl(q.imageUrl) })), mathQuestions: mathQs.map((q) => ({ ...q, imageUrl: normalizeFileUrl(q.imageUrl) })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db.select().from(mockTests).where(eq(mockTests.studentId, studentId)).orderBy(desc(mockTests.startedAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests/:mockTestId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const mtRows = await db.select().from(mockTests)
      .where(and(eq(mockTests.id, req.params.mockTestId), eq(mockTests.studentId, studentId))).limit(1);
    if (mtRows.length === 0) return res.status(404).json({ error: 'Mock test not found' });
    const mt = mtRows[0];
    let englishExam = null;
    let mathExam = null;
    if (mt.englishExamId) { const r = await db.select().from(exams).where(eq(exams.id, mt.englishExamId)).limit(1); englishExam = r[0] || null; }
    if (mt.mathExamId) { const r = await db.select().from(exams).where(eq(exams.id, mt.mathExamId)).limit(1); mathExam = r[0] || null; }
    return res.json({ mockTest: mt, englishExam, mathExam });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/feedback', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .select({ id: feedback.id, content: feedback.content, isRead: feedback.isRead, createdAt: feedback.createdAt, readAt: feedback.readAt, examId: feedback.examId, teacherName: users.name, teacherEmail: users.email })
      .from(feedback).innerJoin(users, eq(feedback.teacherId, users.id))
      .where(eq(feedback.studentId, studentId)).orderBy(desc(feedback.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Vocab spaced-repetition ───────────────────────────────────────────────────

router.get('/vocab/due', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    // Question-derived words due for review
    const due = await db
      .select({
        vocabId: studentVocab.id,
        word: studentVocab.word,
        passageExcerpt: studentVocab.passageExcerpt,
        nextReviewAt: studentVocab.nextReviewAt,
        easeFactor: studentVocab.easeFactor,
        reviewCount: studentVocab.reviewCount,
        questionId: studentVocab.questionId,
      })
      .from(studentVocab)
      .where(and(eq(studentVocab.studentId, studentId), lte(studentVocab.nextReviewAt, new Date())))
      .orderBy(studentVocab.easeFactor, studentVocab.nextReviewAt)
      .limit(20);

    const questionResults = await Promise.all(
      due.map(async (v) => {
        const gcRows = await db
          .select({ id: generatedContent.id, content: generatedContent.content })
          .from(generatedContent)
          .where(and(
            eq(generatedContent.sourceQuestionId, v.questionId),
            eq(generatedContent.studentId, studentId),
            eq(generatedContent.contentType, 'vocab_quiz'),
            sql`${generatedContent.qualityFlag} != 'rejected'`,
          ))
          .orderBy(desc(generatedContent.createdAt))
          .limit(1);
        if (gcRows.length === 0) return null;
        return { source: 'question' as const, ...v, generatedContentId: gcRows[0].id, content: gcRows[0].content };
      }),
    );

    // Teacher vocab words: unstarted OR due for this student
    const allTeacherWords = await db.select({
      id: teacherVocabWords.id,
      word: teacherVocabWords.word,
      definition: teacherVocabWords.definition,
      exampleSentence: teacherVocabWords.exampleSentence,
    }).from(teacherVocabWords);

    const teacherResults = await Promise.all(
      allTeacherWords.map(async (tw) => {
        const progress = await db.select()
          .from(studentTeacherVocabProgress)
          .where(and(
            eq(studentTeacherVocabProgress.studentId, studentId),
            eq(studentTeacherVocabProgress.teacherVocabWordId, tw.id),
          ))
          .limit(1);
        const p = progress[0];
        if (p && p.nextReviewAt > new Date()) return null; // not due yet
        return {
          source: 'teacher' as const,
          vocabId: tw.id,
          word: tw.word,
          definition: tw.definition,
          passageExcerpt: tw.exampleSentence,
          nextReviewAt: p ? p.nextReviewAt.toISOString() : null,
          easeFactor: p ? String(p.easeFactor) : '2.5',
          reviewCount: p ? p.reviewCount : 0,
        };
      }),
    );

    const combined = [
      ...questionResults.filter(Boolean),
      ...teacherResults.filter(Boolean),
    ];
    return res.json(combined);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const reviewVocabSchema = z.object({ isCorrect: z.boolean() });

router.post('/vocab/:vocabId/review', validateBody(reviewVocabSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { vocabId } = req.params;
  const { isCorrect } = req.body;
  try {
    const rows = await db
      .select()
      .from(studentVocab)
      .where(and(eq(studentVocab.id, vocabId), eq(studentVocab.studentId, studentId)))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Vocab item not found' });

    const v = rows[0];
    const easeNow = parseFloat(String(v.easeFactor));

    let newIntervalDays: number;
    let newEaseFactor: number;

    if (isCorrect) {
      newEaseFactor = Math.min(easeNow + 0.1, 5.0);
      newIntervalDays = Math.round(v.intervalDays * easeNow);
    } else {
      newEaseFactor = Math.max(1.3, easeNow - 0.2);
      newIntervalDays = 1;
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newIntervalDays);

    await db.update(studentVocab).set({
      intervalDays: newIntervalDays,
      easeFactor: String(newEaseFactor),
      nextReviewAt: nextReview,
      reviewCount: v.reviewCount + 1,
      lastCorrect: isCorrect,
    }).where(eq(studentVocab.id, vocabId));

    return res.json({ ok: true, nextReviewAt: nextReview, intervalDays: newIntervalDays });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/vocab/teacher/:wordId/review', validateBody(reviewVocabSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { wordId } = req.params;
  const { isCorrect } = req.body;
  try {
    const wordRows = await db.select().from(teacherVocabWords).where(eq(teacherVocabWords.id, wordId)).limit(1);
    if (wordRows.length === 0) return res.status(404).json({ error: 'Word not found' });

    const existing = await db.select().from(studentTeacherVocabProgress)
      .where(and(
        eq(studentTeacherVocabProgress.studentId, studentId),
        eq(studentTeacherVocabProgress.teacherVocabWordId, wordId),
      )).limit(1);

    const p = existing[0];
    const easeNow = p ? parseFloat(String(p.easeFactor)) : 2.5;
    const intervalNow = p ? p.intervalDays : 1;

    let newIntervalDays: number;
    let newEaseFactor: number;
    if (isCorrect) {
      newEaseFactor = Math.min(easeNow + 0.1, 5.0);
      newIntervalDays = Math.round(intervalNow * easeNow);
    } else {
      newEaseFactor = Math.max(1.3, easeNow - 0.2);
      newIntervalDays = 1;
    }
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newIntervalDays);

    if (p) {
      await db.update(studentTeacherVocabProgress).set({
        intervalDays: newIntervalDays,
        easeFactor: String(newEaseFactor),
        nextReviewAt: nextReview,
        reviewCount: p.reviewCount + 1,
        lastCorrect: isCorrect,
      }).where(eq(studentTeacherVocabProgress.id, p.id));
    } else {
      await db.insert(studentTeacherVocabProgress).values({
        studentId,
        teacherVocabWordId: wordId,
        nextReviewAt: nextReview,
        intervalDays: newIntervalDays,
        easeFactor: String(newEaseFactor),
        reviewCount: 1,
        lastCorrect: isCorrect,
      });
    }

    return res.json({ ok: true, nextReviewAt: nextReview, intervalDays: newIntervalDays });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/feedback/:feedbackId/read', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db.update(feedback).set({ isRead: true, readAt: new Date() })
      .where(and(eq(feedback.id, req.params.feedbackId), eq(feedback.studentId, studentId))).returning();
    if (rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Phase 10: Doubt-solving chatbot (practice mode only) ──────────────────────

const OFF_TOPIC_KEYWORDS = ['essay', 'homework', 'physics', 'chemistry', 'history essay', 'college application'];

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userMessage: z.string().min(1).max(2000).trim(),
  examId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
});

// Simple token estimator: ceil(charCount / 4). Not exact — good enough for a ceiling check.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Drop oldest messages until historyTokens <= 2000, but always keep the last 4 (2 user+assistant pairs).
function trimChatHistory(
  msgs: { role: string; content: string; tokenCount: number }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const TOKEN_CAP = 2000;
  const ALWAYS_KEEP = 4;
  const mutable = [...msgs];
  let total = mutable.reduce((acc, m) => acc + m.tokenCount, 0);
  while (total > TOKEN_CAP && mutable.length > ALWAYS_KEEP) {
    const dropped = mutable.shift()!;
    total -= dropped.tokenCount;
  }
  return mutable.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

router.post('/chat', validateBody(chatSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { sessionId, userMessage, examId, questionId } = req.body;

  // Keyword guard — instant response without an AI call
  const msgLower = userMessage.toLowerCase();
  if (OFF_TOPIC_KEYWORDS.some((kw) => msgLower.includes(kw))) {
    return res.json({
      sessionId: sessionId ?? null,
      assistantMessage: "I'm here for SAT questions — what can I help you understand about this question?",
    });
  }

  // Rate limit AI chat calls (1 per message)
  const chatAiCheck = checkAiRateLimit(studentId, 1);
  if (!chatAiCheck.allowed) {
    return res.status(429).json({
      error: `AI request limit reached. Please wait ${Math.ceil(chatAiCheck.retryAfterSeconds! / 60)} minute${Math.ceil(chatAiCheck.retryAfterSeconds! / 60) === 1 ? '' : 's'} before sending more messages.`,
      retryAfterSeconds: chatAiCheck.retryAfterSeconds,
    });
  }

  try {
    let session: typeof chatSessions.$inferSelect;

    if (sessionId) {
      const sessionRows = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.studentId, studentId)))
        .limit(1);
      if (sessionRows.length === 0) return res.status(404).json({ error: 'Session not found' });
      session = sessionRows[0];

      // Update questionId if the student moved to a different question mid-chat
      if (questionId && questionId !== session.questionId) {
        const [updated] = await db.update(chatSessions).set({ questionId })
          .where(eq(chatSessions.id, sessionId)).returning();
        session = updated;
      }
    } else {
      if (!examId) return res.status(400).json({ error: 'examId required to start a new chat session' });

      // Verify exam belongs to this student and is practice mode
      const examRows = await db.select().from(exams)
        .where(and(eq(exams.id, examId), eq(exams.studentId, studentId), eq(exams.type, 'individual')))
        .limit(1);
      if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found or not a practice session' });

      // One session per exam attempt — reuse if already created
      const existing = await db.select().from(chatSessions)
        .where(and(eq(chatSessions.examId, examId), eq(chatSessions.studentId, studentId)))
        .limit(1);

      if (existing.length > 0) {
        session = existing[0];
        if (questionId && questionId !== session.questionId) {
          const [updated] = await db.update(chatSessions).set({ questionId })
            .where(eq(chatSessions.id, session.id)).returning();
          session = updated;
        }
      } else {
        const [created] = await db.insert(chatSessions)
          .values({ examId, studentId, questionId: questionId ?? null })
          .returning();
        session = created;
      }
    }

    // Determine exam subject so the system prompt matches the actual section
    let examSubject: 'english' | 'math' = 'english';
    const subjectRows = await db
      .select({ subject: questionSets.subject })
      .from(exams)
      .innerJoin(questionSets, eq(exams.setId, questionSets.id))
      .where(eq(exams.id, session.examId))
      .limit(1);
    if (subjectRows.length > 0) examSubject = subjectRows[0].subject;
    const isMathExam = examSubject === 'math';

    // Build system prompt from live question data (always fresh — not stored in history)
    let questionText = '(question context unavailable)';
    let passageBlock = '';
    if (session.questionId) {
      const qRows = await db.select({ questionText: questions.questionText, passageText: passages.passageText })
        .from(questions)
        .leftJoin(passages, eq(questions.passageId, passages.id))
        .where(eq(questions.id, session.questionId))
        .limit(1);
      if (qRows.length > 0) {
        questionText = qRows[0].questionText;
        const pt = qRows[0].passageText;
        if (pt) {
          const words = pt.split(/\s+/);
          const excerpt = words.length > 200 ? words.slice(0, 200).join(' ') + '…' : pt;
          passageBlock = ` The passage for this question is: ${excerpt}`;
        }
      }
    }

    const systemPrompt = isMathExam
      ? `You are an SAT Math tutor. You help students understand SAT Math concepts, problem-solving strategies, algebra, geometry, data analysis, and advanced math. You are currently helping a student with this question: ${questionText}.

Answer only questions related to SAT Math — arithmetic, algebra, geometry, trigonometry, data analysis, and test-taking strategy for the Math section. If a student asks about reading, writing, essays, other subjects, or anything unrelated to SAT Math, politely redirect them. Do not write essays, complete assignments, or answer questions from other subjects. Keep answers under 150 words — if more detail is needed, the student should ask a follow-up.`
      : `You are an SAT Reading and Writing tutor. You help students understand SAT concepts, question strategies, grammar rules, and reading techniques. You are currently helping a student with this question: ${questionText}.${passageBlock}

Answer only questions related to SAT Reading and Writing — grammar, vocabulary, reading comprehension, rhetorical analysis, and test-taking strategy for these sections. If a student asks about math, other subjects, or anything unrelated to SAT Reading and Writing, respond with: "I'm focused on SAT Reading and Writing here — for that I'd suggest [the relevant resource]." Do not write essays, complete assignments, or answer questions from other subjects. Keep answers under 150 words — if more detail is needed, the student should ask a follow-up.`;

    // Fetch stored history, apply token cap, inject current user message
    const storedMsgs = await db.select({
      role: chatMessages.role,
      content: chatMessages.content,
      tokenCount: chatMessages.tokenCount,
    })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(chatMessages.createdAt);

    const trimmedHistory = trimChatHistory(storedMsgs);
    const historyForCall: { role: 'user' | 'assistant'; content: string }[] = [
      ...trimmedHistory,
      { role: 'user', content: userMessage },
    ];

    const { content: assistantMessage } = await generateChatResponse(systemPrompt, historyForCall, 'AI_MODEL_FEEDBACK');

    // Write both messages with estimated token counts
    await db.insert(chatMessages).values([
      { sessionId: session.id, role: 'user', content: userMessage, tokenCount: estimateTokens(userMessage) },
      { sessionId: session.id, role: 'assistant', content: assistantMessage, tokenCount: estimateTokens(assistantMessage) },
    ]);

    return res.json({ sessionId: session.id, assistantMessage });
  } catch (err) {
    console.error('[chat] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/chat/:sessionId/messages', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const sessionRows = await db.select().from(chatSessions)
      .where(and(eq(chatSessions.id, req.params.sessionId), eq(chatSessions.studentId, studentId)))
      .limit(1);
    if (sessionRows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const msgs = await db.select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, req.params.sessionId))
      .orderBy(chatMessages.createdAt);

    return res.json(msgs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
