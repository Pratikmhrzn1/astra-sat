import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { reportCategoryChoices } from './enums';
import { accountsTable } from './identity';

export const reportsTable = pgTable('platform_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  category: reportCategoryChoices('category').notNull().default('other'),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ReportRow = typeof reportsTable.$inferSelect;
