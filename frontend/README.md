# SAT Prep — Frontend

React 18 + Vite + TypeScript + TanStack Query v5 + Zustand + Axios, served under `/sat`, styled with Tailwind + heavily inline-styled components. Talks only to the backend via `/api`.

## How to run

```bash
cp .env.example .env    # VITE_API_URL — leave empty in dev (Vite proxies /api → :3001)
npm install
npm run dev             # vite on :5173
```

`vite.config.ts` proxies `/api` → `http://localhost:3001`. The axios `baseURL` is `${VITE_API_URL || ''}/api`, so in dev all requests stay same-origin.

## Entry point → routing (zoom out)

```
src/main.tsx                    QueryClientProvider (retry:1, staleTime 30s) → <App/>
  └─ src/App.tsx                 BrowserRouter basename="/sat" — all routes
       ├─ /login /register /forgot-password /reset-password   (public)
       ├─ /student/*             wrapped in <ProtectedRoute role="student"> + <StudentLayout>
       ├─ /teacher/*             ProtectedRoute role="teacher" + <TeacherLayout>
       ├─ /admin/*               ProtectedRoute role="admin" + <AdminLayout>
       ├─ /student/exams/:examId  ProtectedRoute → <TakeExam/>  (the exam player, full-screen)
       ├─ /live/:joinCode         public lobby for live exams
       └─ * → <Navigate to="/"/>
```

`ProtectedRoute` reads the Zustand store — no user + no accessToken → redirect to `/login`; wrong role → redirect to that role's dashboard.

## Files — what does what

### Boot & infrastructure
| File | Role |
|---|---|
| `src/main.tsx` | React root + Query client config. Central place for global query defaults. |
| `src/App.tsx` | Route table. Also mounts a `visibilitychange` listener that calls `proactiveRefresh()` on tab focus so React Query's refetch burst never starts with a stale token. |
| `src/index.css` | Tailwind directives + global styles (fonts, `.screen-fade`, scrollbars). |
| `src/vite-env.d.ts` | Vite types. |

### API layer (`src/api/`)
Thin typed wrappers around `apiClient`. One file per feature, each export an interface mirroring the backend response + async functions.

| File | Backend endpoints |
|---|---|
| `src/api/client.ts` | **The axios instance + all token logic.** Injects `Bearer`, queues concurrent 401s, silently refreshes via `/auth/refresh`, only force-logs-out on a 401 from refresh (network/5xx never log out). `getApiError()` for error messages. **~Everything depends on this file.** |
| `src/api/auth.ts` | login / register / me / logout / password & profile |
| `src/api/student.ts` | question catalogue, exam lifecycle (start / get / save / submit / results), confirm-feedback types, mock tests + adaptive next-module, vocab (due/review/teacher), narratives, skill-passages, chat |
| `src/api/teacher.ts` | students, question sets/passages/questions CRUD, import-json, subSkill tagging, vocab word bank, feedback |
| `src/api/admin.ts` | stats, users, access codes, backup/restore, run-sql, migrations |
| `src/api/library.ts` | library items + upload |
| `src/api/feedback.ts` | platform feedback (bug/suggestion) |
| `src/api/liveExam.ts` | live-exam sessions, poll, join, results, notifications |

### Global state
| File | Role |
|---|---|
| `src/store/auth.ts` | Zustand auth store, **persisted to localStorage** (`sat-prep-auth`). Holds `user` + `accessToken`. `login/logout/setAccessToken/setUser`. |

### Local storage / offline (`src/lib/`)
| File | Role |
|---|---|
| `src/lib/offline.ts` | IndexedDB (via `idb`) — `exam-progress` store (answers, elapsed time, timer flag — resume path for practice exams) and `teacher-drafts` store (unsaved question forms). Best-effort, failures are silent. |
| `src/lib/utils.ts` | `cn()`, `formatDate`, `formatDateTime`, `formatDuration`, score color helpers. |

### Shared UI (`src/components/ui/`)
`Button`, `Input` (+`Textarea`), `Card`, `Badge`, `Modal` (+`ConfirmModal`), `Spinner` (`PageLoader`). Tailwind classes here; most pages style with inline `React.CSSProperties` in a `CARD`/style-const pattern — follow the page-local style, not the other way around.

### Student pages (`src/pages/student/`)
| File | Role |
|---|---|
| `StudentLayout.tsx` | Sidebar/nav shell + platform-feedback modal. |
| `Dashboard.tsx` | Landing: resume-able practice from IDB, quick actions, stats. |
| `ExamCatalogue.tsx` | List of published practice sets (`/student/question-sets`). |
| `MockTest.tsx` | "Begin Mock SAT" → calls `startMockTest`, navigates into `TakeExam` with `mockSection: 'english_m1'` + `mathM1ExamId` in router state. |
| `TakeExam.tsx` | **The exam player.** One component handles practice, mock module 1/2, and live exams — behavior driven entirely by router `location.state`. Timer auto-submits; adaptive transitions call `handleAdaptiveNextSection`; English M1→Math M1 is a background submit + instant navigation; saves every answer to IDB and syncs to server every 30s. Read it before touching anything exam-shaped. |
| `Results.tsx` | History: practice vs live tabs, score trend sparklines, per-test rows → `ExamDetail`. |
| `ExamDetail.tsx` | Per-exam report. Practice-mode per-question "confirm" (reasoning chip, confidence, AI feedback cards), vocab drill follower, mock narrative panel with retry, chat panel. The AI client is exercised here. |
| `LiveExamLobby.tsx` | Public join-code lobby; polls session status, then routes into `TakeExam`. |
| `VocabReview.tsx` | SM-2 spaced-repetition review of due words. |
| `Feedback.tsx`, `Library.tsx`, `Settings.tsx` | Inbox, shared library, account settings (password, profile, font size pref). |

### Teacher pages (`src/pages/teacher/`)
| File | Role |
|---|---|
| `TeacherLayout.tsx` | Shell. |
| `Dashboard.tsx` | Stats + student list. |
| `Students.tsx` / `StudentDetail.tsx` / `StudentExamDetail.tsx` | Rosters, per-student exam list, per-exam results. |
| `AddContent.tsx` | **1362 lines — the content authoring monolith.** Question sets, passages, MC + SPR question forms (with rich-text + math-symbol toolbar), JSON import, publish/delete, teacher vocab word bank, draft autosave to IDB. |
| `LiveExams.tsx` / `LiveExamSession.tsx` / `LiveExamStudentResult.tsx` | Create/manage live sessions, start, per-participant feedback, release results. |
| `Feedback.tsx`, `Library.tsx` | Sent feedback, library management. |

### Admin pages (`src/pages/admin/`)
`AdminLayout`, `Dashboard` (stats), `Users`, `AccessCodes`, `Database` (backup/download, restore, run SQL, run migrations — the dangerous buttons), `Feedback` (platform feedback), `Library`.

## Golden rules (conventions to follow)

1. **All HTTP goes through `apiClient`** (axios). Never `fetch` or a bare axios call — bearer injection + silent refresh + 401 queueing live there.
2. **All server state goes through TanStack Query.** `useQuery` for reads (queryKeys namespaced like `['student', 'exam', id]`), `useMutation` for writes, `queryClient.invalidateQueries` on success. `src/api/*` holds the query functions + response types; pages consume them.
3. **Auth-gated pages are `ProtectedRoute`-wrapped in `App.tsx`.** Don't hand-roll role checks in a page; extend `App.tsx` + re-use `ProtectedRoute`.
4. **Exam flows are driven by `location.state` + refs, not derive-from-props.** `TakeExam` mirrors mutable values (`answersRef`, `timeLeftRef`, `mockSectionRef`) because timers and IDB sync run in closures. If you add state that the timer/submit path needs, mirror it to a ref too.
5. **Offline exam progress:** save to IDB on every change (`saveExamProgress`), reload on mount for individual exams, clear on submit. Follow the existing best-effort/quiet-failure pattern.
6. **New features get a wrapper in `src/api/<feature>.ts`** that mirrors back the exact response types — the frontend contract is hand-typed per endpoint (no shared types with backend).
7. **Styling:** page-level CSS in `React.CSSProperties` style-consts; shared primitives in `components/ui`. Tailwind utility classes are easiest to use inside the `ui/` components.

## Legacy you can ignore

- The **legacy non-adaptive mock path** in `TakeExam` (`handleNextSection`, straight English→Math) only exists for older sessions where router state lacks `mockSection`. New work goes through `mockSection` + `handleAdaptiveNextSection` (M1→M2). Don't build on the legacy branch.
- `sat-prep-auth` users persisted in localStorage: fine, but accessToken is also in localStorage by design — don't "harden" it by moving it to memory without also updating the refresh flow (`api/client.ts` reads via the store).
- Root-level `*.json` question files (`english-questions.json`, `math-questions.json`) are seed data, not a runtime source — imports come from the DB via teacher JSON import.