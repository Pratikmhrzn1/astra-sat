import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { subjectEnum } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// The SAT domain/skill tree.
//
// Two levels, in one self-referencing table: a *domain* is a row with no parent
// (the eight official ones, four per section), a *skill* is a child of a domain.
// Questions tag against either level, so domain-level tagging is enough to make
// topic practice and weakness analytics work while finer skills get added.
//
// This replaces the old `sub_skill` enum, which had five values and covered only
// Reading & Writing — Math questions could not be tagged at all. A reference
// table rather than a wider enum because `migrate.ts` runs on every boot and
// `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that then
// references the new value.
// ─────────────────────────────────────────────────────────────────────────────
export const skills = pgTable('skills', {
  /** Stable identifier used by questions, e.g. 'algebra', 'transitions'. */
  code: varchar('code', { length: 64 }).primaryKey(),
  label: text('label').notNull(),
  subject: subjectEnum('subject').notNull(),
  /** Null for a domain; the owning domain's code for a skill. */
  parentCode: varchar('parent_code', { length: 64 }).references((): any => skills.code, {
    onDelete: 'set null',
  }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type Skill = typeof skills.$inferSelect;
