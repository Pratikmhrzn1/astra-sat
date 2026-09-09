# SAT Prep — Frontend

React 18 + Vite + TypeScript + TanStack Query + Zustand, served under `/sat`.

## Running

```bash
cp .env.example .env      # VITE_API_URL — leave empty in dev
npm install
npm run dev               # vite on :5173, proxies /api -> :3001
npm run build             # tsc && vite build
npx tsc --noEmit          # the only automated gate — there is no test suite yet
```

## Layout

```
src/
  main.tsx          mounts <App/>
  app/              composition root
    App.tsx           providers + session refresh + routes
    providers.tsx     the React Query client
    router.tsx        the entire route table
    guards/           ProtectedRoute
  layouts/          the three role shells (nav + <Outlet/>)
  shared/           anything two features may both use
    api/client.ts     the single axios instance
    ui/               design-system primitives, imported via '@/shared/ui'
    hooks/ lib/ store/
  features/
    auth/ student/ teacher/ admin/ live-exam/ library/ feedback/
      api/            typed wrappers around the endpoints
      pages/          route targets
      components/     pieces used by that feature's pages
      hooks/          feature-specific behaviour
```

Imports use the `@` alias for `src/`, so a module's import path states where it
sits in the architecture rather than how far away it is.

A feature owns its pages even when several roles open them: the three Library
screens live in `features/library`, not under whichever role reaches them, and
the live-exam screens are one feature rather than being split between the
teacher and student folders.

## The parts worth knowing before you change them

**`shared/api/client.ts` is the only place HTTP happens.** It attaches the
bearer token, queues concurrent 401s behind one refresh, and retries the
original request. Never call `fetch` or a bare axios instance — you would lose
the refresh handling, and a request would fail the moment a token expired. It
force-logs-out only when the refresh endpoint itself returns 401, so a network
blip or a 5xx never evicts someone mid-exam.

**Server state belongs to React Query; only auth is global.** `shared/store/auth`
(Zustand, persisted to localStorage) holds the user and access token. Everything
else is a query keyed by feature, and writes invalidate rather than hand-patching
caches.

**`features/student/pages/TakeExam.tsx` is the exam player** and the most
delicate file here. One component serves practice, both mock modules and live
exams, switching on `location.state` rather than props. Every value the countdown
or the submit path needs is mirrored into a ref, because those run inside
closures created once — **state added for them must be mirrored too**, or it will
read its initial value at the moment it matters.

**Exam progress is written to IndexedDB** (`shared/lib/offline`) on every answer
and synced to the server every 30 seconds. It is best-effort by design: all
failures are swallowed, because losing a cache write must never interrupt a test.

**Styling is inline `React.CSSProperties`, not Tailwind, on most pages.** The
`ui/` primitives use Tailwind classes; pages use `style` objects and a local
`CARD` constant. Follow whichever the file you are editing already uses rather
than converting between them.

## Conventions

- New endpoint: add a typed wrapper in that feature's `api/`, mirroring the
  response shape. There is no shared type package with the backend — the two
  sides are hand-matched, so changing a response means editing both.
- New page: add it to `features/<feature>/pages/` and register it in
  `app/router.tsx` under the right role's `ProtectedRoute`. Do not hand-roll
  role checks inside a page.
- Query keys are namespaced by feature, e.g. `['student', 'exam', id]`.
