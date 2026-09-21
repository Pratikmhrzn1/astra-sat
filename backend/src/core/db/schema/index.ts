/**
 * Every table and enum, split by the domain that owns it and re-exported here,
 * so `import { exams } from 'core/db/schema'` keeps working and drizzle sees the
 * whole schema. Schema changes still need a matching idempotent statement in
 * core/db/migrate.ts, which is what actually runs on boot.
 */
export * from './enums';
export * from './identity';
export * from './taxonomy';
export * from './content';
export * from './exams';
export * from './practice';
export * from './vocab';
export * from './messages';
export * from './analytics';
export * from './mistakes';
export * from './live-exam';
export * from './library';
export * from './platform-feedback';
export * from './survey';
export * from './audit';
