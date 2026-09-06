# Flow — entry point to zoom out

Follow the request through the system. Each section names the exact file to open.

## 1. Reading a request (backend boot → route)

```
npm run dev → tsx src/index.ts
```

`backend/src/index.ts` builds the app: middleware (`helmet` → `cors` FRONTEND_URL → 50mb JSON → cookie-parser), **runs `runMigrations()` before listening**, then:

- `app.use('/api', apiRouter)` — the mount point for every feature router (`backend/src/routes/index.ts`); `apiRouter` in turn mounts `/auth`, `/student`, `/teacher`, `/admin`, `/feedback`, `/library`, and `/` (liveExam).
- `app.use('/uploads', express.static(UPLOAD_DIR))` — files multer wrote locally.

Inside a feature router:

```
router.use(requireAuth, requireRole(['student']))     // middleware/auth.ts — JWT → req.user
router.post('/exams/:id/submit', validateBody(SubmitAnswersSchema), handler)
                                                        // middleware/validate.ts — zod, 422 on failure
```

The handler is a bare `async (req, res) => { try { ... } catch (err) { console.error; res.status(500).json({ error: "Internal server error" }) } }` — convention, because **Express 4 / mongoose-db-express does not catch rejected promises**.

## 2. Backend → database → AI

- Queries: `import { db } from '../db'` (drizzle) with tables from `../db/schema`. Raw SQL via `db.execute(sql\`...\`)` only where needed.
- AI: any model call goes through `backend/src/services/aiClient.ts` → `generateStructuredFeedback` (JSON, retry-on-parse, cost/latency rows) or `generateChatResponse` (free text). Cache: read `ai_feedback` before firing (student.ts confirm).

## 3. Frontend boot → rendering

```
npm run dev → vite on :5173 (proxy /api → :3001)
```

`frontend/src/main.tsx` (QueryClientProvider, retry 1, staleTime 30s) → `frontend/src/App.tsx`. `App.tsx` is the route table: role-protected `/student/*`, `/teacher/*`, `/admin/*`, plus the public `/live/:joinCode` lobby. On mount it calls `proactiveRefresh()` (visibility-focus refresh too).

Page → data:

```
Page component (useQuery/useMutation + hook from src/api/<feature>.ts)
  → src/api/client.ts (the one axios instance; injects Bearer, queues 401s, silent-refreshes via /auth/refresh)
  → GET/POST /api/...
```

`src/store/auth.ts` is the only persisted global state (`sat-prep-auth` in localStorage). Everything server-derived lives in TanStack Query.

## 4. The three most important flows

### Practice exam with AI feedback
1. `frontend/src/pages/student/Dashboard.tsx` or `ExamCatalogue.tsx` → `POST /api/student/exams` (start) creates the exam + per-question `exam_answers` rows.
2. `TakeExam.tsx` runs the player: every answer goes to IndexedDB (`lib/offline.ts`) and the server every 30s (`PUT /student/exams/:id/answers`).
3. Student clicks **confirm** → `POST /student/exams/:id/questions/:qid/confirm` → `student.ts` checks the `ai_feedback` cache → `orchestrateConfirmFeedback()` fires the applicable types in parallel → rows written → responses returned → feedback cards render in `ExamDetail.tsx`.
4. Submit → whole exam graded server-side → narrative AI runs **after the response is already sent** (never block the student on a model call).

### Adaptive mock test
1. `MockTest.tsx` → `POST /student/mock-tests` → creates English M1 + Math M1 exams, returns IDs.
2. Router navigates into `TakeExam` with `location.state` (`mockSection: 'english_m1'`, `mathM1ExamId`, ...). The player is a pure function of that state — that's how one component serves practice, mock, and live exams.
3. English M1 submit → background-submit Math M1, navigate to it. Math M1 submit → `POST /mock-tests/:id/next-module` (M2 difficulty from the ≥60% M1 threshold) → English M2 → Math M2 → results with narrative.

### Live (in-class) exam
1. Teacher creates a session (`POST /live-exam/session` → 6-char join code); students load `/live/:joinCode`.
2. Students poll the lobby (`GET /live-exam/session/:code/status`) — **no websockets anywhere**.
3. Teacher starts → server creates exams for all participants → students vote into `TakeExam` via `LiveExamLobby.tsx` → timed sections → submit.
4. Teacher adds per-participant/question feedback, releases results → notifications → student `Results.tsx` tab.

## 5. Deployment (for when you finally touch it)

- Prod runs the docker-compose stack (postgres 16 + backend + nginx frontend) on a VPS; `render.yaml` is a legacy alternative.
- `./deploy.sh` from the repo root **deletes the source `backend/` and `frontend/` dirs** after publishing; it copies each `.env` to `~/.sat-deploy-backup` first. Don't run it from your workstation expecting the repo to survive, and never re-create env files without checking that backup dir.

## Mental model in one line

A stateless-ish React app whose only global state is auth, talking over one axios instance to one Express app whose only external dependencies are Postgres, OpenRouter, and Resend — and whose two hardest parts are the exam player and the scoring/AI orchestration around it.