import { pgTable, uuid, text, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { roleChoices, accountStatusChoices } from './enums';

export const accountsTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  passwordHash: text('password_hash').notNull(),
  role: roleChoices('role').notNull().default('student'),
  teacherId: uuid('teacher_id').references((): any => accountsTable.id, { onDelete: 'set null' }),
  // Multi-tenancy insurance. Every user is backfilled to a single default
  // organization so that adding a second tenant later is an additive migration
  // rather than a rewrite. NOTHING scopes queries by this yet — do not start
  // filtering on it until the whole data layer does, or isolation will be
  // half-applied, which is worse than not having it.
  organizationId: uuid('organization_id').references((): any => orgsTable.id, { onDelete: 'set null' }),
  // Set when the onboarding survey is answered. NULL means the student has not
  // taken it yet and the app gates them into it; accounts that predate the
  // survey were backfilled as complete (see core/db/migrate.ts).
  surveyCompletedAt: timestamp('survey_completed_at'),
  // Sign-in gates. A public signup starts `pending` and unverified; it needs a
  // confirmed email AND an admin's approval before it can hold a session.
  // Accounts that predate these columns were backfilled as active and verified
  // (see core/db/migrate.ts), so nobody already signed up is locked out.
  status: accountStatusChoices('status').notNull().default('pending'),
  emailVerifiedAt: timestamp('email_verified_at'),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by').references((): any => accountsTable.id, { onDelete: 'set null' }),
  // Account-scoped failed-login lockout. Persisted, so a restart does not hand
  // an attacker a fresh set of guesses.
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const enrolmentCodesTable = pgTable('access_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  role: roleChoices('role').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').references(() => accountsTable.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const refreshTokensTable = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type AccountRow = typeof accountsTable.$inferSelect;

export type NewAccountRow = typeof accountsTable.$inferInsert;

export type EnrolmentCodeRow = typeof enrolmentCodesTable.$inferSelect;

export const resetTokensTable = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  // Holds the sha256 of the emailed token, never the token itself. The column
  // kept its old name so no migration was needed; raw tokens issued before the
  // switch simply stop matching, and they expired within the hour anyway.
  token: text('token').notNull().unique(),
  // TIMESTAMPTZ in migrate.ts, unlike most tables. Declaring it zone-less here
  // made Drizzle misread it whenever the DB session isn't UTC (an expired link
  // stayed valid for hours on a Kathmandu-local Postgres).
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Single-use email confirmation links. Only the sha256 of the token is stored. */
export const verificationTokensTable = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
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
export const orgsTable = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type OrgRow = typeof orgsTable.$inferSelect;
