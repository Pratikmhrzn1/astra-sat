import { pgTable, uuid, text, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('student'),
  teacherId: uuid('teacher_id').references((): any => users.id, { onDelete: 'set null' }),
  // Multi-tenancy insurance. Every user is backfilled to a single default
  // organization so that adding a second tenant later is an additive migration
  // rather than a rewrite. NOTHING scopes queries by this yet — do not start
  // filtering on it until the whole data layer does, or isolation will be
  // half-applied, which is worse than not having it.
  organizationId: uuid('organization_id').references((): any => organizations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accessCodes = pgTable('access_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  role: roleEnum('role').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

export type NewUser = typeof users.$inferInsert;

export type AccessCode = typeof accessCodes.$inferSelect;

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Organizations — multi-tenancy insurance, not multi-tenancy.
//
// The platform serves one consultancy. Retrofitting a tenant boundary across
// every table and query later is a rewrite; carrying a nullable reference from
// now on makes it an additive migration instead. One default row exists and
// every user points at it. No query filters by organization yet, deliberately.
// ─────────────────────────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
