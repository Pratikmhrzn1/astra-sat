# SAT Prep — Backend

Express 4 + TypeScript + Drizzle ORM (PostgreSQL) + JWT auth + OpenRouter AI.
Serves a JSON API under `/api` and uploaded files under `/uploads`.

## Running

```bash
cp .env.example .env      # DATABASE_URL and the two JWT secrets are required
npm install
npm run dev               # tsx watch, port 3001
npm run build && npm start
npx tsc --noEmit          # the only automated gate — there is no test suite yet
```

Migrations run automatically at boot, before the port opens. The frontend dev
server (5173) proxies `/api` here.

## Layout

```
src/
  config/env.ts      every environment variable, validated once at boot
  db/                pool + drizzle client, schema, migrations
  http/              app factory, server boot, error handling, middleware
  lib/               jwt, password, email, url, rate limiting
  modules/
    router.ts        mounts every feature router under /api
    auth/            registration, login, token rotation, password reset
    student/         exams, practice confirm, mocks, vocab, chat, narratives
    teacher/         roster, results, content authoring, vocabulary bank
    admin/           users, access codes, database console, AI tooling
    live-exam/       proctored classroom sessions
    skills/          the SAT domain/skill taxonomy, readable by every role
    analytics/       accuracy, trends and readiness — shared by student and teacher
    library/         shared files and notes
    platform-feedback/  in-app bug reports
    ai/              the only module that calls OpenRouter
    exams/           exam provisioning shared by practice, mock and live
```

A module is `routes -> service -> repository`: routes handle HTTP and nothing
else, services hold the rules and throw typed errors, repositories hold the
queries. Smaller modules collapse the repository into the service.

## The parts worth knowing before you change them

**`config/env.ts` owns `process.env`.** Nothing else reads it. A missing or
malformed variable stops the server at boot with a message naming every problem,
rather than failing later inside whichever request first needed the value. The
AI and email settings double as feature switches — unset `AI_MODEL_NARRATIVE`
and narratives are simply never generated, with no other effect.

**Handlers throw; one place answers.** `asyncHandler` wraps every route so a
rejected promise reaches the error middleware instead of hanging the request —
Express 4 does not await handlers. Routes throw `HttpError`s from
`http/errors.ts` (`notFound('Exam not found')`); `http/middleware/error.ts` turns
those into responses and everything else into a logged 500 with no internals
disclosed. Do not reintroduce per-handler try/catch.

**`db/migrate.ts` is the schema's source of truth**, not `schema.ts`. It is
hand-written idempotent SQL that runs on every boot and again from the admin
"Run migrations" button; a broken statement there stops the server from
starting. `schema.ts` only produces types and the query builder, so **a new
column must be added to both files**. `npm run migrate` (`drizzle-kit push`) is
a dev shortcut and is not what production uses.

**Exams are provisioned in one place.** `modules/exams/exam-provisioning.ts`
creates the `exams` row, its blank `exam_answers` rows and the question count in
a single transaction. Everything downstream assumes all three exist: saving an
answer only UPDATEs an existing row and grading joins over them, so an exam
created any other way silently accepts no answers and scores zero.

**Questions are tagged with `skill_code`, not `sub_skill`.** `modules/skills`
serves the domain/skill tree from the `skills` table and is the only source of
valid codes — `assertKnownSkillCode` checks a tag against the table rather than a
zod enum, because the taxonomy is data. The `sub_skill` enum it replaced had five
Reading-and-Writing values, so **Math could not be tagged at all** and was
invisible to analytics, topic practice and the AI narrative. Those five values are
spelled identically as skill codes and the migration backfills `skill_code` from
`sub_skill`, which is why every reader moved across without translating values.
The column and its zod field survive only so an old import payload still works —
`createQuestion` and `importSetFromJson` map such a tag into `skill_code`. Nothing
reads `sub_skill` any more; do not add a reader.

**There are two difficulty scales, on purpose.** `question_sets.difficulty` is
`low | medium | hard` (TEXT + CHECK) and describes a whole module; it is what the
adaptive mock routes on, so `pathFromModuleDifficulty` in `modules/scoring` reads
it to decide which score band a student can reach. `questions.difficulty` is
`easy | medium | hard` (a pgEnum) and describes one question; it is what topic
practice filters on. They differ in both their values (`low` vs `easy`) and their
type, which looks like a bug and is not. Never convert one into the other, and
never widen one to match the other — a set is not hard because its questions are.

**Scores are computed once, on the server.** `modules/scoring` owns the 200-800 and 400-1600
scales; nothing else may reimplement them, and the browser must never derive a score from a
raw count. A mock module never carries its own `scaled_score` — it is half a section, and the
mock row holds the two section scores. **Test mock membership with
`findMockContextForExam`, never `exam.type`**: live exams use the same `mock_english` /
`mock_math` types, have no `mock_tests` row, and do get a scaled score. When a score cannot
honestly be produced — too few questions, an unfinished mock — the column stays NULL and the
UI shows a dash or a raw tally rather than a number.

**The mistake bank is written at submit, and only from there.** `submitExam` is
the grading authority, so `recordMistakesForExam` runs from it rather than from
the practice confirm step, which submit regrades anyway. One row per
(student, question): a repeat miss bumps `miss_count` and reopens the row, a
correct answer stamps `resolved_at`. **Live exams are the exception** — their
results are hidden until the teacher releases them, so recording at submit would
tell the student which questions they missed before release. Those go through
`recordMistakesOnRelease`, and the release endpoints skip an already-released
participant so a second release cannot double every miss count.

**Analytics are one set of functions, called twice.** `modules/analytics` is the
only place accuracy, trends and readiness are computed, and every function takes
a **list** of student ids — the Phase 3 batch dashboard needs exactly these
aggregates, and a per-student function would have to be rewritten to serve it.
The student's own view and the teacher's view of that student call the same
functions, so the two cannot quote different percentages at each other. Two rules
hold throughout: completed exams only, and **a live-exam attempt only once
released** — an analytic that counted an unreleased result would leak the thing
the release mechanism exists to control. Readiness is arithmetic, never a
projection.

**Students never receive answers.** `modules/student/student.repository.ts`
selects question columns explicitly, so `correctAnswer`, `correctAnswerText` and
`explanation` are absent by construction rather than deleted afterwards. Add
answer-bearing columns to that projection only if you mean to.

**AI work happens after the response.** Narratives and weak-skill passages are
started once the student already has their answer. The confirm step reads its
cache before dispatching and charges the rate limiter only for calls it actually
makes. All model access goes through `modules/ai` — never call OpenRouter
directly, or the cost, retry and cache accounting stops being true.

**In-memory state is single-instance.** The AI budget, login lockouts and the
refresh-token grace window live in process memory (`lib/rate-limit.ts`,
`modules/auth/auth.tokens.ts`). They reset on restart, and running two instances
would give each its own budget. Moving to more than one process means moving
these to Postgres or Redis first.

**`modules/admin/database.service.ts` is a production console.** Backup, restore
(truncates and replaces), arbitrary SQL and the migration runner, gated on the
admin role alone. Treat edits there accordingly. **Every new table must be listed
in either `BACKUP_TABLES` (in foreign-key order) or `EXCLUDED_TABLES` with a
reason** — a load-time assertion refuses to boot otherwise. That check exists
because the backup set was previously hand-maintained with no cross-check, so
tables added later were silently never exported, and reading passages, the
resource library and all vocabulary were missing from every backup until it was
noticed during a restore.

## Environment

See `.env.example`, which documents every variable. `DATABASE_URL`, `JWT_SECRET`
and `JWT_REFRESH_SECRET` are required; the AI and Resend settings are optional
and disable their features when absent.
