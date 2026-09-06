# SAT Prep — Backend

Express 4 + TypeScript + Drizzle ORM (PostgreSQL) + JWT auth + OpenRouter AI. Serves a JSON API under `/api` and static uploads under `/uploads`.

## How to run

```bash
cp .env.example .env      # fill in DATABASE_URL at minimum
npm install
npm run dev               # tsx watch src/index.ts, port 3001
```

Server boot **runs migrations automatically** (`runMigrations()` in `src/index.ts:58`) — no separate migrate step in dev. The frontend dev server (port 5173) proxies `/api` → `:3001`.

## Entry point → request flow (zoom out)

```
src/index.ts                     creates express app, middleware, mounts routes, runs migrations on boot
  └─ app.use("/api", apiRouter)  src/routes/index.ts → mounts all feature routers
       ├─ /auth     → routes/auth.ts
       ├─ /student  → routes/student.ts      (student portal + exam lifecycle + AI)
       ├─ /teacher  → routes/teacher.ts      (content authoring, students, feedback)
       ├─ /admin    → routes/admin.ts        (users, codes, DB tools, AI tools)
       ├─ /feedback → routes/feedback.ts     (platform bug/suggestion feedback)
       ├─ /library  → routes/library.ts      (file uploads + notes)
       └─ /         → routes/liveExam.ts     (live exams: teacher + student endpoints)
  └─ /uploads       static files (multer upload target)
```

Every request: `helmet` → `cors` (FRONTEND_URL only, credentials) → JSON body (50mb) → cookie parser → router. The refresh-token cookie `rt` is httpOnly and sent with every request (`path: '/'`). Auth is **header-based** (`Authorization: Bearer <accessToken>` — 15 min) with cookie-based silent refresh.

## Files — what does what

### Boot & middleware
| File | Role |
|---|---|
| `src/index.ts` | App factory. Sets `trust proxy`, middleware stack, mounts `/api` + `/uploads`, `GET /health`, 404 + 500 handlers. Runs migrations before `listen`. **Never touch lightly — a boot bug kills prod.** Also exports `UPLOAD_DIR`. |
| `src/db/index.ts` | PostgreSQL `Pool` + `drizzle` client. Single source of DB access (`db`). |
| `src/db/migrate.ts` | **Hand-rolled idempotent schema** (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... IF NOT EXISTS`). Runs on every boot *and* via the admin "Run migrations" button. The schema's real source of truth for prod. |
| `src/middleware/auth.ts` | `requireAuth` (verifies access JWT → `req.user`), `requireRole([...])` (role gate). |
| `src/middleware/validate.ts` | `validateBody` / `validateQuery` — zod parse, 422 on failure, replaces `req.body` with parsed data. |

### Auth (`src/lib`, `src/routes/auth.ts`)
| File | Role |
|---|---|
| `src/lib/jwt.ts` | `signAccessToken` (15 min), `signRefreshToken` (7d, jti nonce). Secrets from env (`JWT_SECRET`, `JWT_REFRESH_SECRET`). |
| `src/lib/password.ts` | bcrypt hash/compare (cost 12). |
| `src/lib/email.ts` | Resend transactional emails (welcome, password reset) — HTML templates. No-op when `RESEND_API_KEY` unset. |
| `src/lib/url.ts` | `normalizeFileUrl()` — rewrites `/uploads/...` paths to absolute `PUBLIC_BASE_URL`. **Apply to every file URL you return.** |
| `src/routes/auth.ts` | register (access-code gated), login (per-account lockout map), refresh (**token rotation in a DB transaction + 30s in-memory grace map for multi-tab**), logout, /me, change-password, profile, forgot/reset password. |

### Student portal — the heart (`src/routes/student.ts`, ~1500 lines)
Everything a student does: catalogue, **exam lifecycle**, scoring, AI feedback orchestration, mock tests, vocab, chat. Read this one file and you know the product.

- **Exam lifecycle**: `POST /exams` (creates exam + one `exam_answers` row per question), `PUT /exams/:id/answers` (autosave), `POST /exams/:id/submit` (grades everything, sets status/score, **fires narrative AI in background after responding**), `GET /exams/:id/results`.
- **Scoring**: uses `examAnswers.isCorrect` set on submit; SPR answers (grid-in) graded by `sprIsCorrect()` (numeric tolerance 0.001, fraction parsing).
- **Practice confirm** (`POST /exams/:id/questions/:qid/confirm`): checks `ai_feedback` cache → fires uncached types in parallel via `orchestrateConfirmFeedback` → writes results → returns. Rate-limits AI by user (300 calls / 15 min). After responding, runs weak-skill threshold check (`checkAndTriggerSkillPassage`, fires on every 3rd wrong answer per sub-skill).
- **Mock tests**: `POST /mock-tests` (random medium sets → english + math M1), `POST /mock-tests/:id/next-module` (**adaptive**: ≥60% on M1 → hard M2, else low; idempotent), `GET /mock-tests`.
- **Vocab**: SM-2-style spaced repetition in `POST /vocab/:id/review` + `/vocab/teacher/:wordId/review`; `/vocab/due` merges question-derived words + teacher word bank due items.
- **Chat** (`POST /chat`): doubt-solving tutor, off-topic keyword guard, system prompt varies by subject, history trimmed to 2000 tokens. Free-text AI (not JSON).
- **Narratives**: `GET /exams/:id/narrative`, `POST /exams/:id/narrative/retry`.
- Rate limiting here is **in-memory Maps** — resets on server restart. Fine for single-instance deploy, not for horizontal scaling.

### Teacher portal (`src/routes/teacher.ts`)
CRUD for students (scoped to `users.teacherId`), question sets (create/publish/delete), passages, questions (MC + SPR by discriminated zod union), `import-json` bulk import, teacher vocab word bank, feedback to students.

### Admin portal (`src/routes/admin.ts`)
Stats, user management, access codes, **DB backup/restore/run-sql/migrate** (raw SQL against the pool — admin-only and dangerous), `ai-model-stats`, `auto-tag-subskill` (batch AI classification of untagged questions), and the **generated-content quality gate** (`PATCH /generated-content/:id/flag`) — approving an AI `skill_passage` promotes it into live `question_sets`/`passages`/`questions` inside a transaction.

### Live exams (`src/routes/liveExam.ts`)
Teacher: create session (6-char join code), view participants, start (**creates english+math exams for every participant then flips status to active**), per-participant feedback, release results (notifications). Student: status check, join, poll lobby, results after release. No websockets/Socket.io — students **poll** the lobby.

### AI integration (`src/services/aiClient.ts`)
The only file allowed to call OpenRouter.
- `generateStructuredFeedback()` — JSON-mode call, auto-strip fences, **1 retry on parse failure**, per-request cost/latency/token recording.
- `generateChatResponse()` — free-text for the chatbot.
- `orchestrateConfirmFeedback()` — fan-out of independent feedback prompts via `Promise.all`; each catches its own errors so one type never blocks the rest.
- Prompt builders are module-private per feedback type (`buildReasoningCheckpointPrompts`, `buildGrammarDiagnosisPrompts`, `buildTrapExplainerPrompts`, `buildCommandOfEvidencePrompts`, `buildTransitionsCoachPrompts`, `buildVocabDrillPrompts`).
- `getApplicableFeedbackTypes()` decides which of the 6 feedback types fire for a given answer context.

## Env vars that matter

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (required) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Token signing |
| `FRONTEND_URL` | CORS origin (comma-separated not supported — single origin) |
| `PUBLIC_BASE_URL` | Builds absolute `/uploads` URLs (email + frontend) |
| `OPENROUTER_API_KEY` + `AI_MODEL_FEEDBACK` / `AI_MODEL_NARRATIVE` / `AI_MODEL_CLASSIFY` | **Presence = feature on/off.** If `AI_MODEL_NARRATIVE` is unset, mock narrative rows are never created and the narrative UI is hidden/disabled. |
| `RESEND_API_KEY` / `RESEND_FROM` | Emails — unset = silently skipped |
| `COOKIE_SECURE` / `NODE_ENV` | Refresh-cookie `secure`/`sameSite` rules |
| `UPLOAD_DIR` | Where multer writes (persisted volume in prod) |

## Golden rules (conventions to follow)

1. **Never call OpenRouter directly from a route.** Go through `services/aiClient.ts`. Check the `ai_feedback` cache before firing; respect `checkAiRateLimit`; write cost/latency rows after.
2. **Validate every `req.body` with a zod schema through `validateBody`.** Raw schema at the top of the file, next to route.
3. **Async handlers must be wrapped in try/catch → `res.status(500).json({ error: 'Internal server error' })`.** Express 4 does **not** catch rejected promises.
4. **All queries use the drizzle `db` + schema imports.** Raw SQL (`db.execute`/`client.query`) only for things drizzle can't express (enum DDL, random set pick, aggregate filters). When doing multi-statement writes that must not partially apply, use `db.transaction` or an explicit pool transaction (see admin restore / generated-content approval — the fixes are documented inline as "Fix B1/B3").
5. **Role gate at the router top**: `router.use(requireAuth, requireRole(['student']))`. New routes inherit it.
6. **`normalizeFileUrl` on every file/image URL** before returning it to the frontend.
7. **Response-first, background-after** for expensive AI work. The student never waits on a model call (see submit → narrative, confirm → skill-passage trigger).
8. New DB columns: add to **both** `schema.ts` (types) **and** `migrate.ts` (idempotent ALTER). The Drizzle `npm run migrate` (`drizzle-kit push`) is a dev shortcut, not the prod mechanism.

## Legacy you can ignore

- `src/db/migrate-local.sql`, `src/db/seed-english.sql` — one-off local setup artifacts. Real schema + seed (admin code `000000`) live in `migrate.ts`.
- The refresh-cookie `path: '/api/auth'` restriction described in `../sat-platform-prompt.md` — the implementation sets `path: '/'`; the doc is aspirational, code is truth.
- `drizzle-kit push` as a migration strategy — it has no history and isn't what prod uses.