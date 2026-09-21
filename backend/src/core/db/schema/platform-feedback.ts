import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { feedbackCategoryEnum } from './enums';
import { users } from './identity';

export const platformFeedback = pgTable('platform_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: feedbackCategoryEnum('category').notNull().default('other'),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PlatformFeedback = typeof platformFeedback.$inferSelect;
