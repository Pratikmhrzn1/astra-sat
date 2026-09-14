# Mock SAT — NIEC SAT Prep Platform

Digital SAT practice and mock-test platform with three user roles (student / teacher / admin), AI-generated per-question feedback, adaptive mock exams, vocabulary spaced repetition, and live (in-class) exams.

## Repo layout

```
backend/   Express 4 + TypeScript + Drizzle ORM + Postgres  →  see backend/README.md
frontend/  React 18 + Vite + TS + TanStack Query + Zustand  →  see frontend/README.md
flow.md    the end-to-end request flow (entry point zoom out)
docs/      working notes: plan.md (Phase 2/3 build plan), Brainstorm.md, client-report.html
sat-platform-prompt.md   original feature spec — historical, code is the source of truth
docker-compose.yml / render.yaml / deploy.sh   deployment
```

## How it works in one paragraph

A student registers with an access code, practices question sets, and gets AI feedback per question. A **practice exam** is auto-created per question set attempt, answers are autosaved (and locally persisted to IndexedDB for offline resilience), and on submit everything is graded server-side. Per-question "confirm" calls fire cached, parallel AI feedback types through a single AI client. A **mock test** chains four timed sections with adaptive difficulty (English M1 → Math M1 → English M2 → Math M2, M2 difficulty decided by the ≥60% threshold on M1). A teacher authors content in `AddContent`, can run **live exams** (6-char join code, students poll a lobby, all take the same set, results are released with teacher feedback afterward), and follows each student's exam/feedback history. Admin manages access codes, users, DB tools, and gates AI-generated skill passages before they go live.

## Environment

- Backend: Postgres (`DATABASE_URL`), OpenRouter AI keys, Resend email — see `backend/.env.example`.
- Frontend: `VITE_API_URL` (empty in dev, Vite proxies `/api` → `:3001`) — see `frontend/.env.example`.
- The frontend is built with Vite `base: '/sat/'` and served under `/sat`; redirect any `/sat/*` path to `frontend/index.html`.

## Key conventions (brief)

- **Handlers throw; one middleware answers.** Routes are wrapped in `asyncHandler` and throw `AppError`s (`backend/src/core/errors.ts`) — no per-handler try/catch.
- **Domain modules, public entry points.** Backend `modules/<domain>` and frontend `features/<domain>` / `entities/<x>` are imported only through their `index.ts`; `npm run depcruise` in each package enforces the dependency direction.
- **All AI calls go through `backend/src/modules/ai/ai.client.ts`** — never call OpenRouter directly; rate-limit, cache, and cost-track there.
- ***All HTTP goes through `frontend/src/shared/api/http.ts`** — bearer injection + silent refresh + 401 queueing.
- **All server state on the frontend goes through TanStack Query** (per-feature `api.ts` wrappers).
- New DB columns are added to **both** `backend/src/core/db/schema/<domain>.ts` (types) and `backend/src/core/db/migrate.ts` (idempotent SQL).

## Risk radar (read these before touching them)

| File | Why it's risky |
|---|---|
| `backend/src/core/db/migrate.ts` | Hand-rolled idempotent schema **runs on every server boot** and via the admin migrations button. A bad ALTER can corrupt prod or brick startup. |
| `backend/src/modules/{exams,attempts,practice}/` | The heart of the product: `exams/grading.ts` + `exams/scaled-score.ts`, `attempts/attempts.service.ts` (lifecycle), `attempts/mock.service.ts` (adaptive chain), `practice/practice.service.ts` (confirm + AI), `practice/narrative.service.ts`. Bugs here grade real students wrong or burn AI spend. |
| `frontend/src/features/exam-player/pages/TakeExamPage.tsx` | The exam player — timer, offline IDB sync, adaptive section transitions driven by refs. A bug silently corrupts student attempts. |
| `frontend/src/shared/api/http.ts` | Refresh logic failure = everyone locked out. Net-effect of every 401 in the app. |

## Running locally

```bash
# backend  (port 3001)
cd backend && cp .env.example .env && npm install && npm run dev

# frontend (port 5173, proxies /api → :3001)
cd frontend && cp .env.example .env && npm install && npm run dev
```