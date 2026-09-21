import { pgTable, uuid, text, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { fileTypeEnum } from './enums';
import { users } from './identity';

export const libraryItems = pgTable('library_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  fileUrl: text('file_url'),
  fileType: fileTypeEnum('file_type').notNull(),
  fileName: varchar('file_name', { length: 300 }),
  noteContent: text('note_content'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type LibraryItem = typeof libraryItems.$inferSelect;
