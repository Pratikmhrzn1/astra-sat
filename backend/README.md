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
admin role alone. Treat edits there accordingly.

## Environment

See `.env.example`, which documents every variable. `DATABASE_URL`, `JWT_SECRET`
and `JWT_REFRESH_SECRET` are required; the AI and Resend settings are optional
and disable their features when absent.
