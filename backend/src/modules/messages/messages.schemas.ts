import { z } from 'zod';

export const sendFeedbackSchema = z.object({
  studentId: z.string().uuid(),
  examId: z.string().uuid().optional(),
  content: z.string().min(1, 'Feedback content is required').max(5000),
});
export type SendFeedbackInput = z.infer<typeof sendFeedbackSchema>;
