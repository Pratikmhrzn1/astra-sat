import { defineConfig } from 'vitest/config';

/**
 * Tests run against a real Postgres database whose name must end in `_test`
 * (checked in test/global-setup.ts) — every table is emptied between tests.
 *
 * These values are written into process.env here, before any test or setup
 * file loads `core/config/env`, and they win over backend/.env (dotenv never
 * overrides a variable that is already set). Point TEST_DATABASE_URL elsewhere
 * if your local Postgres needs credentials.
 */
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/sat_test',
  JWT_SECRET: 'test-access-secret-0123456789abcdef0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012345678',
  FRONTEND_URL: 'http://localhost:5173',
  // Empty means "unset": no real email is ever sent and no AI is ever called.
  RESEND_API_KEY: '',
  OPENROUTER_API_KEY: '',
  PUBLIC_BASE_URL: '',
});

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // One database, so test files take turns rather than truncating each other's rows.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
