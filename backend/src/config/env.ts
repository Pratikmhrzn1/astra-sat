import 'dotenv/config';
import path from 'path';
import { z } from 'zod';

/**
 * The single place environment variables are read.
 *
 * Nothing else in the codebase may touch `process.env` — import `env` from here
 * instead. That guarantees every variable is validated exactly once, at boot,
 * and that a misconfigured deployment fails immediately with a readable message
 * rather than at 3am inside whichever request first happens to need the value.
 */

/** Accepts the spellings people actually put in .env files. */
const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

/** Treats an empty string as "not set" — `FOO=` in a .env file means absent. */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),

  // ── Required ────────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'required — the Postgres connection string'),
  JWT_SECRET: z.string().min(1, 'required — used to sign 15-minute access tokens'),
  JWT_REFRESH_SECRET: z.string().min(1, 'required — used to sign 7-day refresh tokens'),

  // ── HTTP ────────────────────────────────────────────────────────────────────
  // One origin, or several separated by commas. Every entry is sent back as an
  // allowed CORS origin; credentials are always enabled, so `*` is not accepted.
  FRONTEND_URL: z.string().trim().min(1).default('http://localhost:5173'),
  // Absolute base used to rewrite /uploads/... paths into fully-qualified URLs
  // for emails and API responses. Unset means paths are returned as stored.
  PUBLIC_BASE_URL: optionalString,
  // Overrides the refresh cookie's `secure` flag. Defaults to on in production.
  COOKIE_SECURE: booleanish.optional(),

  // ── Filesystem ──────────────────────────────────────────────────────────────
  UPLOAD_DIR: optionalString,

  // ── AI (OpenRouter) ─────────────────────────────────────────────────────────
  // Each model variable is a feature flag as well as a setting: with the key or
  // the model missing, that feature is skipped rather than failing.
  OPENROUTER_API_KEY: optionalString,
  AI_MODEL_FEEDBACK: optionalString,
  AI_MODEL_NARRATIVE: optionalString,
  AI_MODEL_CLASSIFY: optionalString,

  // ── Email (Resend) ──────────────────────────────────────────────────────────
  RESEND_API_KEY: optionalString,
  RESEND_FROM: optionalString,
});

export type RawEnv = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function parseEnv(source: NodeJS.ProcessEnv): RawEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Every problem at once — fixing .env one restart at a time is miserable.
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(result.error)}\n\n` +
        `See backend/.env.example for the full list of variables.`,
    );
  }
  return result.data;
}

const raw = parseEnv(process.env);

const isProduction = raw.NODE_ENV === 'production';

/** Secrets short enough to be brute-forced are a warning, not a boot failure. */
const MIN_SECRET_LENGTH = 32;
for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
  if (raw[name].length < MIN_SECRET_LENGTH) {
    console.warn(
      `[env] ${name} is ${raw[name].length} characters; ${MIN_SECRET_LENGTH}+ is strongly recommended.`,
    );
  }
}
if (isProduction && raw.JWT_SECRET === raw.JWT_REFRESH_SECRET) {
  console.warn(
    '[env] JWT_SECRET and JWT_REFRESH_SECRET are identical — a leaked access token then forges refresh tokens.',
  );
}

const aiModels = {
  feedback: raw.AI_MODEL_FEEDBACK,
  narrative: raw.AI_MODEL_NARRATIVE,
  classify: raw.AI_MODEL_CLASSIFY,
};

const aiEnabled = Boolean(raw.OPENROUTER_API_KEY);
const emailEnabled = Boolean(raw.RESEND_API_KEY);

if (!aiEnabled) {
  console.warn('[env] OPENROUTER_API_KEY is not set — all AI features are disabled.');
} else {
  for (const [feature, model] of Object.entries(aiModels)) {
    if (!model) console.warn(`[env] AI_MODEL_${feature.toUpperCase()} is not set — ${feature} AI is disabled.`);
  }
}
if (!emailEnabled) {
  console.warn('[env] RESEND_API_KEY is not set — transactional emails will be skipped.');
}

/**
 * Validated configuration. Import this, never `process.env`.
 */
export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,

  databaseUrl: raw.DATABASE_URL,
  // Managed Postgres providers terminate TLS with certificates the container
  // does not have a CA for; verification stays off in production, as before.
  databaseSsl: isProduction ? ({ rejectUnauthorized: false } as const) : false,

  jwt: {
    accessSecret: raw.JWT_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessTtl: '15m',
    refreshTtl: '7d',
    /** Must match `refreshTtl`; used to stamp `refresh_tokens.expires_at`. */
    refreshTtlMs: 7 * 24 * 60 * 60 * 1000,
  },

  http: {
    corsOrigins: raw.FRONTEND_URL.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    publicBaseUrl: raw.PUBLIC_BASE_URL,
    /** Explicit COOKIE_SECURE wins; otherwise secure cookies in production only. */
    cookieSecure: raw.COOKIE_SECURE ?? isProduction,
    jsonBodyLimit: '50mb',
  },

  uploads: {
    dir: raw.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
  },

  ai: {
    enabled: aiEnabled,
    apiKey: raw.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: aiModels,
    /** Per-user AI call budget, enforced in-process (see the rate limiter). */
    rateLimit: { calls: 300, windowMs: 15 * 60 * 1000 },
  },

  email: {
    enabled: emailEnabled,
    apiKey: raw.RESEND_API_KEY,
    from: raw.RESEND_FROM ?? 'noreply@mocktest.niec.edu.np',
  },
} as const;

export type Env = typeof env;
