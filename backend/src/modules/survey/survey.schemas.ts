import { z } from 'zod';

export const INTAKE_QUESTION_TYPES = ['single_choice', 'multi_choice', 'short_text', 'scale'] as const;
export type IntakeQuestionType = (typeof INTAKE_QUESTION_TYPES)[number];

/** The two choice types are the only ones that carry options. */
export const CHOICE_KINDS: IntakeQuestionType[] = ['single_choice', 'multi_choice'];

export const SCALE_FLOOR = 1;
export const SCALE_CEILING = 5;

const optionsField = z.array(z.string().trim().min(1, 'An option cannot be empty').max(200)).max(12);

export const addIntakeQuestionRules = z.object({
  prompt: z.string().trim().min(3, 'Question must be at least 3 characters').max(500),
  type: z.enum(INTAKE_QUESTION_TYPES).default('single_choice'),
  options: optionsField.default([]),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type CreateIntakeQuestionPayload = z.infer<typeof addIntakeQuestionRules>;

/** PATCH semantics: anything omitted keeps its stored value. */
export const editIntakeQuestionRules = addIntakeQuestionRules.partial();
export type UpdateIntakeQuestionPayload = z.infer<typeof editIntakeQuestionRules>;

export const reorderQuestionsRules = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderQuestionsPayload = z.infer<typeof reorderQuestionsRules>;

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

export const commitIntakeRules = z.object({
  answers: z
    .array(z.object({ questionId: z.string().uuid(), answer: answerValue }))
    .max(200),
});
export type SubmitIntakePayload = z.infer<typeof commitIntakeRules>;
