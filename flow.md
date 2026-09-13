# Architecture — what is actually going on

This document explains the *mechanisms*: where state lives, which invariants hold, and why
the code is shaped the way it is. For a file-by-file index see `backend/README.md` and
`frontend/README.md`. Where this document and `sat-platform-prompt.md` disagree, the code wins.

---

## 1. The shape of the system

Two deployables and one database. There is no queue, no cache server, no websocket layer,
no background worker, and no shared type package.

```
React SPA (Vite, served under /sat)          Express 4 (single process)          Postgres
   one axios instance ──────── /api ───────────► one router tree ────────────────► one Pool
   one Zustand store (auth)                        │
   TanStack Query = all server state               ├──► OpenRouter (via aiClient.ts only)
   IndexedDB = exam progress + drafts               └──► Resend (email)
```

Three consequences follow from "single Express process, no queue", and they explain most of
the design decisions further down:

1. **Background work is a non-awaited promise inside the request process.** There is no job
   runner, so "async AI" means: send the HTTP response, then keep working in the same process.
   If the process restarts mid-flight, that work is simply lost (a `mock_narratives` row stuck
   at `pending` is the visible symptom).
2. **Rate limiting and the refresh grace window are in-memory `Map`s.** `aiRateMap` in
   `modules/student/student.routes.ts`, the login-lockout map in `modules/auth/auth.service.ts`, and `recentlyRotated`
   in the refresh path all live in process memory. They reset on restart and they are
   **wrong under horizontal scaling** — two instances would each grant a full AI budget.
   This is a deliberate single-instance tradeoff, not an oversight to "fix" by adding a
   second replica.
3. **Schema changes are applied at boot.** `start()` in `src/index.ts` awaits `runMigrations()`
   *before* `listen()`, and exits the process on failure. A broken statement in
   `db/migrate.ts` does not degrade the app — it prevents it from starting at all.

---

## 2. Two sources of schema truth (and which one matters)

`db/schema.ts` is Drizzle table definitions: it produces TypeScript types and the query
builder. It never touches the database.

`db/migrate.ts` is ~400 lines of hand-written idempotent SQL — `DO $$ … EXCEPTION WHEN
duplicate_object` for enums, `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT
EXISTS`. This is what actually shapes production, and it runs on **every** boot and again
whenever an admin clicks "Run migrations".

So a new column needs **two edits**, and they can silently diverge: add it only to
`schema.ts` and every query referencing it fails at runtime against a column that does not
exist; add it only to `migrate.ts` and Drizzle cannot see it. `npm run migrate`
(`drizzle-kit push`) exists in package.json but is not the production mechanism — it has no
history and is not what boot runs.

---

## 3. Auth: short access tokens, rotating refresh tokens, and the races that creates

The access token is a 15-minute JWT held in the Zustand store (persisted to `localStorage`
under `sat-prep-auth`) and attached by an axios request interceptor. The refresh token is a
7-day JWT delivered as an httpOnly cookie `rt` on `path: '/'`, and its **sha256 hash** is
stored in `refresh_tokens` — the raw token never touches the database.

Refresh is *rotating*: each use deletes the old hash and inserts a new one. Rotation is what
makes stolen-token reuse detectable, and it is also what makes concurrency hard, because a
browser with four tabs will fire four refreshes with the same cookie. Both sides defend:

**Server** (`modules/auth/auth.routes.ts` `POST /refresh`) verifies the JWT signature first (cheap
rejection), then runs the swap inside `db.transaction`: `DELETE … RETURNING`, and if zero
rows came back, another request already rotated this token, so this one lost the race and
returns `null` from the transaction. The winner writes its result into a 30-second in-memory
`recentlyRotated` map keyed by the *old* hash. A loser waits 50 ms, re-reads that map, and
serves the winner's token instead of failing. Without this map, opening a second tab would
log you out.

**Client** (`api/client.ts`) keeps a module-level `isRefreshing` flag and a `failedQueue`. The
first 401 triggers the refresh; every concurrent 401 parks a promise in the queue and is
replayed with the new token. Two further details matter:

- `proactiveRefresh()` runs on `visibilitychange` (wired in `App.tsx`) and refreshes when the
  token is expired or within 60s of expiring. This exists specifically because TanStack
  Query's `refetchOnWindowFocus` fires a *burst* of queries the instant a tab regains focus;
  without the pre-emptive refresh that burst becomes a 401 cascade.
- Force-logout happens **only** when the refresh endpoint itself answers 401. A network error
  or a 5xx deliberately does not log out — a flaky connection must not evict a student
  mid-exam.

Authorization itself is two middlewares: `requireAuth` (Bearer → `req.user`) and
`requireRole([...])`. Student/teacher/admin routers apply both at the router root, so every
route inherits the gate. **`liveExam.ts` is the exception** — it is mounted at `/` (not under
a prefix) and applies `requireAuth` per-route with hand-written `if (req.user!.role !==
'teacher')` checks inside each handler. New live-exam routes must repeat that check by hand;
forgetting it leaves the route open to any authenticated user.

---

## 4. The exam engine

### The core invariant

**An exam's answer sheet is materialized at creation time.** `POST /student/exams` inserts the
`exams` row *and* one `exam_answers` row per question in the set. Everything downstream
assumes those rows exist: `PUT /exams/:id/answers` only ever `UPDATE`s them (an answer for a
question with no row is silently discarded), submit grades by joining them, and `ai_feedback`
hangs off `exam_answers.id`.

This is the single most important thing to know about the exam code — and it is exactly what
the live-exam path gets wrong (see §6).

### Grading

Grading is server-side and happens twice, by design. `POST /exams/:id/submit` recomputes
`isCorrect` for every row and derives `score` as a plain count of correct rows; multiple
choice compares the `answer_choice` enum, and student-produced responses go through
`sprIsCorrect()`, which parses fractions and decimals and compares with a 0.001 tolerance.
Practice-mode `/confirm` grades a *single* question early so it can hand the AI a correct/wrong
context, and writes `isCorrect` at that point too. Submit later overwrites it with the same
verdict. Nothing trusts a client-supplied score.

`totalQuestions` is stored on the exam at creation and used as the denominator for the
reported percentage — it is not recounted at submit time.

### Tagging

Questions carry a `skill_code` from the `skills` table — eight domains, five of
which have named skills beneath them. `GET /skills` serves the tree to every signed-in
role, and `?withCounts=true` adds published-question counts per node so a UI can grey out
a topic nobody has authored yet.

Tags come from three places: a teacher in the content manager, a bulk import payload, and
the AI classifier (`POST /admin/questions/auto-tag-subskill`), which now covers **both**
subjects — English to the five skills, Math to the four domains, each with its own prompt
and its own valid-code list so a confused answer naming the other subject's code is
rejected as unclear. Anything the classifier writes is `ai_suggested` and appears in the
content manager's AI Review filter; any tag a person writes — in the editor, in the review
flow, or in an import file — is stamped `human_confirmed` and stays out of that queue.

The old `sub_skill` enum had no Math values, so Math sat permanently at 0% tagged. The
admin dashboard now shows tagging coverage per subject, because every per-skill analytic
is bounded by it.

### Mistake bank and topic practice

Two loops that both run through the ordinary exam machinery rather than around it.

`submitExam` files every wrong answer into `mistakes` — one row per (student, question),
so a repeat miss bumps `miss_count` and reopens the row rather than adding a second entry.
A correct answer on an open mistake stamps `resolved_at`, which is what makes the bank
drain. Blanks count as misses, because `gradeAnswer` already treats unanswered as wrong.
**Live exams defer this to the teacher's release**: their results are hidden until then, and
a bank that filled at submit would reveal which questions were missed. `releaseParticipantResult`
and `releaseAllResults` both skip an already-released participant, so re-releasing cannot
double a miss count.

`POST /student/mistakes/practice` and `POST /student/exams/topic` both build a real exam
with `set_id = null` and a `label` — "Mistake review", "Topic: Algebra". That is deliberate:
resolution, scoring and the answer sheet all work exactly as they do for any other exam,
and the assemblers do not have to reimplement grading. Topic practice matches a domain
*or any skill beneath it*, prefers questions the student has not seen, and refuses under
five eligible questions; the catalogue uses `/skills?withCounts=true` to disable topics
that cannot reach that.

Both produce exams that span several sets, so `findQuestionsForExam` — which reads the
answer sheet and left-joins each question's own passage — is what makes an English topic
exam show the right passage above each question.

### Analytics

`modules/analytics` answers two questions — "why am I losing points?" and "am I improving?"
— and is the only place either is computed. `GET /student/analytics/overview` and
`GET /teacher/students/:id/analytics` return the same payload from the same functions, so
a teacher and a student always see the same numbers.

`skillAccuracy` joins `exam_answers → questions → skills` and rolls each skill up to its
domain via `COALESCE(parent_code, code)`; `domainAccuracy` folds those together, weakest
first. `scoreTrend` unions completed mocks with standalone scaled exams, excluding mock
modules because the mock row already carries their sections, and derives a set-less
exam's subject (topic practice, mistake review) from its first question's set so those
exams stay on the trend. `readiness` is latest total, a rolling average of the last three,
the gap to target and days to the test — arithmetic, with a confidence flag rather than a
projection.

`readiness.estimate` is **the** estimated score: the latest scored mock, or, without one,
the latest scaled practice score in each section with a total only when both exist. Its
`source` (`mock` | `practice`) is shown wherever it is. The Dashboard hero, the Progress
readiness card, the History trend cards and the teacher's view all read it or the same
`scoreTrend`, so no two screens can disagree. Confidence stays mock-based: `none` without a
mock however many practice tests exist.

Two rules run through all of it. Completed exams only, and **a live-exam attempt only once
the teacher has released it** — a `NOT EXISTS` against `live_exam_participants` holds back
the unreleased. And a domain under five attempts reports its attempt count instead of a
percentage, because one question moves it twenty points.

The AI narrative reads `skillAccuracy` scoped to a single exam rather than running its own
query, so the prompt and the progress view cannot disagree.

### Scaled scoring

The raw count above is not what a student is shown. Submit also writes `exams.scaled_score`,
the 200-800 section score, using `modules/scoring` — the one place the 200-800 and 400-1600
scales are defined. Three cases produce no scaled score, and each renders as an em dash or a
raw `x / y` rather than a number: an exam shorter than `MIN_QUESTIONS_TO_SCALE` (10), an exam
graded before this existed, and **any module of a mock**.

That last case is the one worth remembering. A mock module is half a section, so it is scored
on the mock's own row instead: once all four modules are `completed`, `finalizeMockIfComplete`
sums each section's two modules and scales the pair against the adaptive path the student
earned — `pathFromModuleDifficulty` reads the *Module 2* set's difficulty, so the same raw
20/27 per module is 640 on the hard path and 530 on the low one. The write is guarded on
`status = 'in_progress'`, which is what makes a double submit idempotent.

**Mock membership, not `exam.type`, is the test for "is this a mock module".** Live exams are
created with the same `mock_english` / `mock_math` types and have no `mock_tests` row, and they
*do* get a scaled score of their own. `findMockContextForExam` checks all four module columns.

`POST /admin/scoring/backfill` fills these columns for history, reusing the same functions so
the formula cannot drift between backfilled rows and live ones. It only touches NULLs.

### Client state: why `TakeExam` is full of refs

`TakeExam.tsx` is a single component serving practice, both mock modules, and live exams. It
does not branch on a mode prop; it branches on `location.state` (`mockSection`, `mockTestId`,
`liveExam`, `sectionStartedAt`, …). Router state *is* the exam mode.

Every value the exam needs is mirrored into a `useRef` — `answersRef`, `timeLeftRef`,
`mockSectionRef`, `dataRef`, `timerEnabledRef`. This is not redundancy: the countdown
`setInterval`, the 30-second sync interval, and the auto-submit path all run inside closures
created once, and a plain state variable read there would be permanently stale. **Any new
state that the timer or submit path touches must be mirrored to a ref as well**, or it will
read its initial value at exactly the moment it matters.

Two timers run concurrently: the countdown (only when `timerEnabled`) and an unconditional
elapsed-seconds ticker used for time-spent on untimed practice. `getTimeSpent()` picks between
`20*60 - timeLeftRef.current` and `savedTimeSpent + elapsed` accordingly.

Durability is layered: every answer change writes to IndexedDB immediately (best-effort, all
failures swallowed), and a 30-second interval pushes to the server — plus an immediate push
when the browser fires `online`. IDB is the resume path for practice exams; on mount, saved
progress *overrides* server answers, including the timer flag. IDB is cleared on submit.

Live exams derive remaining time from a **server-anchored** `sectionStartedAt` rather than a
local countdown start, so a student who reloads mid-section does not gain time.

---

## 5. Mock tests: the adaptive chain

A mock is four exams chained through one `mock_tests` row (`english_exam_id`, `math_exam_id`,
`english_m2_exam_id`, `math_m2_exam_id`).

`POST /mock-tests` picks Module-1 sets with `ORDER BY RANDOM() LIMIT 1` over
`difficulty = 'medium'` — everyone starts at the same difficulty — falling back to any set of
that subject if no medium one exists. Both M1 exams and all their answer rows are created up
front.

`POST /mock-tests/:id/next-module` is the adaptive step. It reads the submitted M1's
`score/totalQuestions` and picks `hard` at **≥60%**, `low` below it, then selects a set of that
difficulty *excluding the M1 set*, with two progressively looser fallbacks. It is
**idempotent**: if the M2 exam already exists on the mock row it is returned as-is, which is
what makes a double-submit or a reload during the transition safe. Issuing a module only
records which exam it is — the mock is completed and scored by `finalizeMockIfComplete` on the
submit path, because a mock is finished when the student finishes it, not when the last module
is handed out.

The client-side chain lives in `TakeExam` and is deliberately ordered
**English M1 → English M2 → Math M1 → Math M2**: `handleAdaptiveNextSection` submits the
current module, calls `next-module`, and navigates to the returned M2; the `english_m2`
completion branch inside `submitMutation.onSuccess` then jumps to the `mathM1ExamId` carried
in router state. `GET /exams/:id` supplies `mathExamId` from the mock itself, so the chain
resolves from either English module rather than only from Module 1. The timer's expiry handler calls the same functions, which is why they are
`useCallback`s reading refs.

An older non-adaptive path (`handleNextSection`, straight English→Math with a background
submit while the pre-fetched Math exam renders instantly) still exists for sessions whose
router state has no `mockSection`. Don't extend it.

### Timing: the server holds the clock

`modules/student/exam-timing.ts` owns it. A mock module is created with `time_limit_seconds`
(Reading & Writing 32 min, Math 35 min) and **no** deadline; `deadline_at` is stamped the first
time the player opens it — `GET /exams/:id?open=1`. The flag matters: the player pre-fetches the
next section with a plain `GET`, and that must not start its clock. A live section's deadline is
the session start plus its duration, set when the exam is provisioned.

`GET /exams/:id` returns `deadlineAt` and `serverNow`; the player counts down to the deadline,
corrected by the clock offset and recomputed every tick, so a reload, a throttled tab or a wrong
device clock cannot stretch it. On the server:

- autosave is refused (409) more than 30 seconds past the deadline;
- a timed exam's `time_spent_seconds` is computed from the deadline, and the client's figure is
  ignored (a live section keeps the client figure, capped);
- an expired exam is graded on what autosave stored and closed **lazily**, when it is next read,
  listed, saved to, or needed by `next-module`. There is no scheduler.

`submitExam` only closes an exam still `in_progress`, so a student's own submit racing an
expiry close cannot grade it twice. The player treats "already completed" as success, and
opening an exam the server has already closed carries on the chain as a timeout would have.

---

## 6. Live exams

Teacher creates a session with a 6-character join code; students open the public
`/live/:joinCode` lobby and **poll** for status. There are no websockets anywhere in this
codebase — every "realtime" surface is polling.

Starting a session (`POST /teacher/live-exams/:sessionId/start`) loops over participants and
inserts an English and a Math exam for each, then flips the session to `active` and stamps
`startedAt` (the anchor the client's timer uses). Results are gated: a teacher writes
per-question and global feedback, then explicitly releases, which writes a `notifications` row.

**A scoring bug used to live here, and is now fixed.** The start handler previously inserted
`exams` rows with neither `exam_answers` rows nor a `totalQuestions` value, so a live attempt had
nothing to save into and nothing to grade — submit saw zero rows and stored `score = 0` out of a
`totalQuestions` default of `0`.

Both the practice/mock path and live exams now provision through one helper,
`modules/exams/exam-provisioning.ts` → `createExamWithAnswerSheet()`, which inserts the exam row,
its blank answer sheet and `totalQuestions` **in a single transaction**. That is the invariant from
§4 made unbreakable: no caller can half-apply it by forgetting a step. If you add another way to
start an exam, provision it through that helper too.

---

## 7. AI: one client, six feedback types, cache-first, never on the critical path

`modules/ai/ai.client.ts` is the only module that talks to OpenRouter (OpenAI-compatible SDK,
lazily constructed so a missing key fails per-request rather than at boot). Models are chosen
by **env var name**, not value — callers pass `'AI_MODEL_FEEDBACK'` / `'AI_MODEL_NARRATIVE'`
/ `'AI_MODEL_CLASSIFY'` and the client reads it. Those vars double as feature flags: unset
`AI_MODEL_NARRATIVE` and no narrative row is ever created, and the whole narrative UI goes
away.

`generateStructuredFeedback()` asks for JSON, strips code fences, and on a parse failure
re-prompts once with the bad output attached ("return ONLY the JSON object"), throwing
`AIParseError` if that also fails. It requests `usage: { include: true }` so OpenRouter returns
a per-request cost, and every call's model, latency, token counts and cost are persisted on the
row it produces — that is where the admin AI-cost stats come from.

**The confirm flow** (`POST /exams/:id/questions/:qid/confirm`) is the most intricate path in
the product, and the ordering is deliberate:

1. Grade the single question and persist the answer (skipped when the exam is already
   completed — reviewing a finished exam must not mutate it).
2. `getApplicableFeedbackTypes()` decides which of the six types apply from
   (subject, subSkill, questionType, isCorrect). Only `reasoning_checkpoint` always fires;
   `vocab_drill` is the only one that fires on correct answers too.
3. Read every cached `ai_feedback` row for this answer in **one** query and subtract them.
4. Charge the rate limiter *the exact number of calls about to fire*, not a worst case.
5. `orchestrateConfirmFeedback()` fans out via `Promise.all`, each type with its own
   purpose-built prompt and its own try/catch, so one failing type degrades to `null` in the
   response instead of failing the request. Prompt builders pass **minimum context** on
   purpose — only `trap_explainer` and `command_of_evidence` receive passage text, and both
   excerpt long passages (paragraph reference, or a ±150-word window around a keyword anchor).
6. Respond.
7. *Then* run the weak-skill check.

The cache key is `(exam_answer_id, feedback_type)`, so re-confirming the same question is free.

**Background AI** follows one rule — respond first, then work:

- *Narrative*: submit inserts a `pending` `mock_narratives` row **before** responding (so the
  UI has something to poll), responds, then generates. Failure flips the row to `failed`, which
  is what the retry endpoint acts on.
- *Weak-skill passages*: after every wrong practice answer with a tagged subSkill, count that
  student's lifetime wrong answers for that skill; fire only on exact multiples of 3. The claim
  is an atomic upsert on `student_skill_triggers` whose `DO UPDATE … WHERE trigger_count <
  EXCLUDED.trigger_count` returns zero rows to concurrent losers, so two simultaneous confirms
  cannot both generate. The result lands in `generated_content` as `pending` and is invisible
  to students until an admin approves it, at which point it is promoted into real
  `question_sets`/`passages`/`questions` inside a transaction.

Everything AI-generated is human-gated before a student sees it. That is the point of
`generated_content.quality_flag`.

---

## 8. Where each kind of state lives

| State | Home | Lifetime |
|---|---|---|
| Access token, current user | Zustand `sat-prep-auth`, localStorage | until logout |
| Refresh token | httpOnly cookie + sha256 in `refresh_tokens` | 7 days, rotated per use |
| All server-derived data | TanStack Query cache (`staleTime` 30s, retry 1) | per session |
| In-flight exam answers | IndexedDB `exam-progress` + server every 30s | cleared on submit |
| Unsaved teacher question forms | IndexedDB `teacher-drafts` | until saved |
| AI budget, login lockouts, refresh grace | in-memory Maps in the Express process | until restart |
| Everything else | Postgres | — |

Frontend and backend types are hand-mirrored per endpoint in `src/api/*.ts`. Nothing enforces
that they agree — changing a response shape means editing both sides.

---

## 9. Deployment

Production is the `docker-compose.yml` stack (postgres 16 + backend + nginx-served frontend
build) on a VPS; `render.yaml` is a legacy alternative.

`deploy.sh` runs **on the VPS**. It deletes the `backend/` and `frontend/` source directories
after building (the images are self-contained), so it first mirrors `backend/.env` (required —
compose reads it via `env_file` and the build hard-fails without it) and `frontend/.env`
(optional) to `~/.sat-deploy-backup`, outside the repo where `rm -rf` cannot reach, and
restores them before each build. Running it on a workstation will delete your source tree.

---

## The one-line version

A React SPA whose only global state is auth talks through one axios instance to one Express
process that owns Postgres, OpenRouter and Resend — and whose two hard parts are an exam
player driven by router state and refs, and a scoring/AI layer that grades on the server,
caches every model call, and does all expensive work after the response has already been sent.
