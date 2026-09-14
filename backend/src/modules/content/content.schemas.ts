import { z } from 'zod';

/**
 * LEGACY. The five Reading-and-Writing values of the old `sub_skill` enum.
 *
 * Superseded by `skillCode`, which points at the `skills` table and covers Math
 * too. Kept only because the AI classifier's prompt still names these five and
 * the column still exists; new tagging goes through `skillCodeField`.
 */
export const SUB_SKILLS = [
  'grammar',
  'inference',
  'command_of_evidence',
  'vocab_in_context',
  'transitions',
] as const;

const subSkillField = z.enum(SUB_SKILLS).nullable().optional();

/**
 * A domain or skill code from the `skills` table.
 *
 * Shape only — the value is checked against the table in the service, because a
 * zod enum here would have to be regenerated every time a skill is added, and
 * the taxonomy is data rather than code.
 */
const skillCodeField = z.string().min(1).max(64).nullable().optional();

/**
 * Per-question difficulty. Note this is `easy | medium | hard` while a *set's*
 * difficulty is `low | medium | hard` — see backend/README.md. The two describe
 * different things and must never be converted into one another.
 */
const questionDifficultyField = z.enum(['easy', 'medium', 'hard']).nullable().optional();

export const createSetSchema = z.object({
  title: z.string().min(1).max(255),
  subject: z.enum(['english', 'math']),
  description: z.string().max(2000).optional().default(''),
  difficulty: z.enum(['low', 'medium', 'hard']).nullable().optional(),
  isLiveExam: z.boolean().optional().default(false),
});
export type CreateSetInput = z.infer<typeof createSetSchema>;

export const updateSetSchema = createSetSchema.partial();
export type UpdateSetInput = z.infer<typeof updateSetSchema>;

/**
 * Bulk import of a whole set.
 *
 * `isDraft` defaults to true to match `createSet`: an imported set used to
 * publish the instant it landed, so a bad paste was live to students before
 * anyone had looked at it. Pass `isDraft: false` to import something already
 * reviewed. Set-level `difficulty` is accepted because without it an imported
 * set is invisible to adaptive module selection, which picks by tier.
 */
export const importJsonSchema = z.object({
  title: z.string().min(1).max(255),
  subject: z.enum(['english', 'math']),
  description: z.string().max(2000).optional().default(''),
  difficulty: z.enum(['low', 'medium', 'hard']).nullable().optional(),
  isDraft: z.boolean().optional().default(true),
  passages: z
    .array(
      z.object({
        title: z.string().max(255).optional().default(''),
        passageText: z.string().min(1),
        orderIndex: z.number().int().optional(),
      }),
    )
    .optional()
    .default([]),
  questions: z
    .array(
      z.object({
        passageIndex: z.number().int().nullable().optional(),
        questionType: z.enum(['multiple_choice', 'student_produced_response']),
        questionText: z.string().min(1),
        subSkill: subSkillField,
        skillCode: skillCodeField,
        difficulty: questionDifficultyField,
        optionA: z.string().nullable().optional(),
        optionB: z.string().nullable().optional(),
        optionC: z.string().nullable().optional(),
        optionD: z.string().nullable().optional(),
        correctAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
        correctAnswerText: z.string().nullable().optional(),
        explanation: z.string().nullable().optional(),
        orderIndex: z.number().int().optional(),
      }),
    )
    .min(1, 'At least one question is required'),
});
export type ImportJsonInput = z.infer<typeof importJsonSchema>;

export const createPassageSchema = z.object({
  title: z.string().max(255).optional().default(''),
  passageText: z.string().min(1, 'Passage text is required').max(20000),
  orderIndex: z.number().int().min(0).optional().default(0),
});
export type CreatePassageInput = z.infer<typeof createPassageSchema>;

export const updatePassageSchema = createPassageSchema.partial();
export type UpdatePassageInput = z.infer<typeof updatePassageSchema>;

/**
 * Multiple choice and grid-in questions have genuinely different requirements —
 * one needs four options and a letter, the other needs answer text — so the
 * schema is a discriminated union rather than one shape with everything
 * optional. That way "an MC question with no option C" is rejected at the edge.
 */
export const createQuestionSchema = z.discriminatedUnion('questionType', [
  z.object({
    questionType: z.literal('multiple_choice'),
    passageId: z.string().uuid().nullable().optional(),
    subSkill: subSkillField,
    skillCode: skillCodeField,
    difficulty: questionDifficultyField,
    questionText: z.string().min(1, 'Question text is required'),
    optionA: z.string().min(1, 'Option A is required'),
    optionB: z.string().min(1, 'Option B is required'),
    optionC: z.string().min(1, 'Option C is required'),
    optionD: z.string().min(1, 'Option D is required'),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']),
    explanation: z.string().optional().nullable(),
    imageUrl: z.string().url().nullable().optional(),
    orderIndex: z.number().int().min(0).default(0),
  }),
  z.object({
    questionType: z.literal('student_produced_response'),
    passageId: z.string().uuid().nullable().optional(),
    subSkill: subSkillField,
    skillCode: skillCodeField,
    difficulty: questionDifficultyField,
    questionText: z.string().min(1, 'Question text is required'),
    optionA: z.string().optional().nullable(),
    optionB: z.string().optional().nullable(),
    optionC: z.string().optional().nullable(),
    optionD: z.string().optional().nullable(),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']).optional().nullable(),
    correctAnswerText: z.string().min(1, 'Correct answer is required for SPR'),
    explanation: z.string().optional().nullable(),
    imageUrl: z.string().url().nullable().optional(),
    orderIndex: z.number().int().min(0).default(0),
  }),
]);
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/**
 * Editable fields of an existing question.
 *
 * Listed explicitly rather than accepting the request body wholesale: an
 * unbounded update would let a caller move a question to another set, or flip
 * `generated`, simply by naming the column. Identity and provenance columns are
 * absent by design.
 */
export const updateQuestionSchema = z
  .object({
    passageId: z.string().uuid().nullable(),
    questionType: z.enum(['multiple_choice', 'student_produced_response']),
    questionText: z.string().min(1),
    subSkill: z.enum(SUB_SKILLS).nullable(),
    skillCode: z.string().min(1).max(64).nullable(),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
    optionA: z.string().nullable(),
    optionB: z.string().nullable(),
    optionC: z.string().nullable(),
    optionD: z.string().nullable(),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']).nullable(),
    correctAnswerText: z.string().nullable(),
    explanation: z.string().nullable(),
    imageUrl: z.string().nullable(),
    orderIndex: z.number().int().min(0),
  })
  .partial();
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

/**
 * The AI Review flow: confirm or override a machine-suggested tag.
 *
 * Takes a `skillCode` so a reviewer can correct a Math question, which the old
 * five-value field could not express at all. `subSkillSource` stays the
 * provenance marker — writing `human_confirmed` is what removes a question from
 * the review queue.
 */
export const updateSubSkillSchema = z.object({
  skillCode: z.string().min(1).max(64).nullable().optional(),
  subSkillSource: z.enum(['ai_suggested', 'human_confirmed']),
});
export type UpdateSubSkillInput = z.infer<typeof updateSubSkillSchema>;

export const flagContentSchema = z.object({
  qualityFlag: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
});
export type FlagContentInput = z.infer<typeof flagContentSchema>;

export const listContentQuerySchema = z.object({
  type: z.enum(['vocab_quiz', 'skill_passage']).optional(),
  flag: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
