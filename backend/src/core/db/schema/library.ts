import { pgTable, uuid, text, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { fileKindChoices } from './enums';
import { accountsTable } from './identity';

export const resourceItemsTable = pgTable('library_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  fileUrl: text('file_url'),
  fileType: fileKindChoices('file_type').notNull(),
  fileName: varchar('file_name', { length: 300 }),
  noteContent: text('note_content'),
  uploadedBy: uuid('uploaded_by').references(() => accountsTable.id, { onDelete: 'set null' }),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ResourceItemRow = typeof resourceItemsTable.$inferSelect;
