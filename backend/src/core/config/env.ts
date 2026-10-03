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

/** Same rules the API enforces, so a seeded password can also be typed at login. */
const optionalPassword = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(128)
  .optional();

/** `30m`, `24h`, `7d` → milliseconds. */
const duration = z
  .string()
  .trim()
  .regex(/^\d+[mhd]$/, 'must be a number followed by m, h or d (e.g. 24h)')
  .transform((v) => {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[v.slice(-1) as 'm' | 'h' | 'd'];
    return Number(v.slice(0, -1)) * unit;
  });

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('must be a valid email address')
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

  // ── Account security ────────────────────────────────────────────────────────
  EMAIL_VERIFICATION_TTL: duration.default('24h'),
  PASSWORD_RESET_TTL: duration.default('1h'),
  // Consecutive wrong passwords before an account is locked, and for how long.
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),

  // ── Seed accounts (used only by `npm run seed`) ─────────────────────────────
  // Bootstrap logins for a fresh database. Never read at runtime — the seed
  // script is the only consumer, so leaving these set does not affect a
  // running server.
  SEED_ADMIN_EMAIL: optionalEmail,
  SEED_ADMIN_PASSWORD: optionalPassword,
  SEED_ADMIN_NAME: optionalString,
  SEED_STUDENT_EMAIL: optionalEmail,
  SEED_STUDENT_PASSWORD: optionalPassword,
  SEED_STUDENT_NAME: optionalString,
});

export type RawSettings = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function parseEnv(source: NodeJS.ProcessEnv): RawSettings {
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
  console.warn(
    isProduction
      ? '[env] RESEND_API_KEY is not set — NO EMAILS WILL BE SENT. New signups cannot verify their address, so none of them can ever sign in.'
      : '[env] RESEND_API_KEY is not set — emails (including verification links) are printed to this console instead.',
  );
}

const corsOrigins = raw.FRONTEND_URL.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Validated configuration. Import this, never `process.env`.
 */
export const settings = {
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
    corsOrigins,
    publicBaseUrl: raw.PUBLIC_BASE_URL,
    /**
     * Where links in emails point: the app's root, including the /sat base path
     * the frontend is served under. Falls back to the first frontend origin.
     */
    appUrl: (raw.PUBLIC_BASE_URL ?? `${corsOrigins[0] ?? 'http://localhost:5173'}/sat`).replace(/\/+$/, ''),
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
    // Either a bare address or a full `Name <address>` sender.
    from: raw.RESEND_FROM ?? 'noreply@mocktest.niec.edu.np',
  },

  auth: {
    emailVerificationTtlMs: raw.EMAIL_VERIFICATION_TTL,
    passwordResetTtlMs: raw.PASSWORD_RESET_TTL,
    loginMaxFailures: raw.LOGIN_MAX_FAILED_ATTEMPTS,
    loginLockoutMs: raw.LOGIN_LOCKOUT_MINUTES * 60_000,
  },

  /** Consumed by `npm run seed`; null for any account left unconfigured. */
  seed: {
    admin: seedAccount(raw.SEED_ADMIN_EMAIL, raw.SEED_ADMIN_PASSWORD, raw.SEED_ADMIN_NAME, 'Admin'),
    student: seedAccount(raw.SEED_STUDENT_EMAIL, raw.SEED_STUDENT_PASSWORD, raw.SEED_STUDENT_NAME, 'Student'),
  },
} as const;

export interface SeedCredentials {
  email: string;
  password: string;
  name: string;
}

/** An account is seedable only when it has both an email and a password. */
function seedAccount(
  email: string | undefined,
  password: string | undefined,
  name: string | undefined,
  fallbackName: string,
): SeedCredentials | null {
  if (!email || !password) return null;
  return { email, password, name: name ?? fallbackName };
}

export type Settings = typeof settings;
