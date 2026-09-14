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

Type-first, after `liphistudio/bitebox`: a folder says what kind of thing is in
it, and pages stay thin by composing sections.

```
src/
  main.tsx  App.tsx  providers.tsx  router.tsx  index.css
  api/            typed endpoint wrappers, one file per backend area
    http.ts         the single axios instance (bearer, 401 queue, refresh)
    auth student teacher admin liveExam library feedback skills
  pages/          route targets only, named *Page.tsx
    auth/ student/ teacher/ admin/ live-exam/ library/ feedback/
  sections/       the large blocks one page is built from
    student/exam-detail  student/take-exam  student/settings
    teacher/add-content  library/
  components/     reusable pieces
    common/         design-system primitives + class recipes, via '@/components/common'
    auth/ student/ teacher/ live-exam/
  shared/         app chrome: AppShell and the three role layouts
                  (sidebar ≥1280px, icon rail 640–1279px, tab bar + More sheet <640px)
  hooks/  lib/  store/
```

Imports use the `@` alias for `src/`, so a module's import path states where it
sits in the architecture rather than how far away it is.

- A page decides *what* is on screen and owns the queries and state; a section
  renders one block of it and takes values and callbacks as props.
- A page over ~300 lines is a sign it wants sections. `pages/teacher/AddContentPage`
  only chooses between the vocab bank, the set list and `SetEditor`.
- Screens several roles open share their sections: teacher and admin Library are
  both `sections/library/LibraryManager` with different props.

## The parts worth knowing before you change them

***`api/http.ts` is the only place HTTP happens.** It attaches the
bearer token, queues concurrent 401s behind one refresh, and retries the
original request. Never call `fetch` or a bare axios instance — you would lose
the refresh handling, and a request would fail the moment a token expired. It
force-logs-out only when the refresh endpoint itself returns 401, so a network
blip or a 5xx never evicts someone mid-exam.

***Server state belongs to React Query; only auth is global.** `store/auth`
(Zustand, persisted to localStorage) holds the user and access token. Everything
else is a query keyed by feature, and writes invalidate rather than hand-patching
caches.

***`pages/student/TakeExamPage.tsx` is the exam player** and the most
delicate file here. All of its logic stays in the page; `sections/student/take-exam`
is presentational only. One component serves practice, both mock modules and live
exams, switching on `location.state` rather than props. Every value the countdown
or the submit path needs is mirrored into a ref, because those run inside
closures created once — **state added for them must be mirrored too**, or it will
read its initial value at the moment it matters.

**Exam progress is written to IndexedDB** (`lib/offline`) on every answer
and synced to the server every 30 seconds. It is best-effort by design: all
failures are swallowed, because losing a cache write must never interrupt a test.

***Styling is Tailwind.** Rules of thumb:

- **Tokens live in `tailwind.config.js`** — colours (`ink`, `muted`, `subtle`,
  `accent-text`, `danger`, …), shadows, easings, keyframes. A value used in more
  than one place becomes a token, not a repeated `[#hex]`.
- **Repeated class strings are recipes in `components/common`**: `buttonClass`,
  `fieldClass` / `inputClass` / `labelClass`, `surfaceClass` / `cardClass`,
  `pageClass`, `pillClass` / `chipClass`, `iconButtonClass`, `toastClass`.
  Compose them with `cn()` from `lib/utils` (clsx + tailwind-merge).
- **Responsive with `sm:` (640px), not `useMobile()`.** The hook stays only
  where the markup itself differs or a JS number needs the width (Results' card
  list vs table, chart heights).
- **Hover with `hover:`**, never `onPointerEnter` writing `style` —
  `hoverOnlyWhenSupported` keeps it off touch screens.
- **Inline `style` only for values computed at runtime**: data-driven widths
  and colours, chart geometry, anything JS animates imperatively.
- **`index.css` is for what utilities can't express**: CSS variables the
  accessibility media queries retune, base element rules, the shell's `:has()`
  hover rail, and the reduced-motion / transparency / contrast overrides.

Type has three roles: headings and scores use `font-display` (Bricolage
Grotesque), reading passages use `font-serif` (Newsreader), and all UI text is
the system face. Both web
fonts load via a `<link>` in `index.html` — never a CSS `@import`, which the
build drops after `@tailwind`.
Motion uses the `spring` / `ui` easings and must degrade under
`prefers-reduced-motion` (`motion-reduce:`, or a named class in `index.css`).
Buttons get press feedback from a global `:active` rule.

## Conventions

- New endpoint: add a typed wrapper in the matching `api/*.ts`, mirroring the
  response shape. There is no shared type package with the backend — the two
  sides are hand-matched, so changing a response means editing both.
- New page: add `pages/<area>/<Name>Page.tsx` and register it in
  `router.tsx` under the right role's `ProtectedRoute`. Do not hand-roll
  role checks inside a page.
- Query keys are namespaced by feature, e.g. `['student', 'exam', id]`.
- **Never hardcode the taxonomy.** Domain and skill names come from `/skills`
  via `api/skills.ts`; tag with `<SkillSelect>` from `components/common`. Three
  separate hardcoded copies used to exist — a five-value list that excluded Math
  entirely, plus two parallel domain lists in `ExamCatalogue` and `MockTest` that
  drifted apart.
- An exam need not belong to a set. Topic practice and mistake reviews are
  assembled across sets and carry `label` instead of `setTitle` — render
  `setTitle ?? label`. `subject` is always present; the server derives it from
  the exam's own questions.
- **No chart library, on purpose.** `components/common/TrendChart` and
  `components/common/AccuracyBars` are ~30KB of SVG and CSS against ~450KB for recharts,
  on a bundle already past Vite's warning. Series colours are validated for
  colourblind separation and chroma rather than picked by eye, and identity never
  rests on colour alone — every chart carries a legend or a text label.
- **Never compute a score.** `lib/score.ts` is the only place that formats
  or colours one, and the numbers themselves come from the server —
  `exam.scaledScore` for a single exam, `mock.totalScore` / `rwScore` /
  `mathScore` for a mock. `Math.round(200 + pct * 600)` used to live in ten
  places across three pages and could not know which adaptive module the student
  was routed to. A null score renders as `—` or a raw `x / y`; never substitute a
  default, and label every score "Estimated".
