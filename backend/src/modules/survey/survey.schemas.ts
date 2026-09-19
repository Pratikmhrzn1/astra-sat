import { z } from 'zod';

export const SURVEY_QUESTION_TYPES = ['single_choice', 'multi_choice', 'short_text', 'scale'] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

/** The two choice types are the only ones that carry options. */
export const CHOICE_TYPES: SurveyQuestionType[] = ['single_choice', 'multi_choice'];

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

const optionsField = z.array(z.string().trim().min(1, 'An option cannot be empty').max(200)).max(12);

export const createQuestionSchema = z.object({
  prompt: z.string().trim().min(3, 'Question must be at least 3 characters').max(500),
  type: z.enum(SURVEY_QUESTION_TYPES).default('single_choice'),
  options: optionsField.default([]),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** PATCH semantics: anything omitted keeps its stored value. */
export const updateQuestionSchema = createQuestionSchema.partial();
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const reorderQuestionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;

/**
 * One answer's shape depends on its question's type, which the payload does not
 * carry — so this only checks the value is one of the three storable shapes,
 * and the service checks it against the question it answers.
 */
const answerValue = z.union([
  z.string().trim().max(1000),
  z.array(z.string().trim().min(1).max(200)).max(12),
  z.number().int(),
]);

export const submitSurveySchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().uuid(), answer: answerValue }))
    .max(200),
});
export type SubmitSurveyInput = z.infer<typeof submitSurveySchema>;
