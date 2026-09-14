# Build Plan — Phase 2 "Make the data real" (+ Phase 3 preview)

> Derived from `Brainstorm.md` §4, §9 and §13. Where this plan and the code disagree, the code wins.
> Status verified against the working tree at commit `859c4d5`. Every file:line below was checked.
>
> **Status (2026-09-13): Phase 2 (M0–M5) is complete.** M0–M3 are ticked from their commits
> (`1269392`, `d8f025b`, `fa1fe2c`, `68a62bb`); M4 (`d5df30d`) was audited and its gaps
> closed. M5 landed as: a server-held exam clock (deadline stamped on open, late writes
> refused, lazy auto-close, B4 and B10); copy-on-write question versioning with archive and
> retire in place of cascading deletes; and an audit log with a read-only admin view.
> Verified against a copy of real data (versioning 17/17 and timer 16/16 scripted checks)
> plus browser checks of the player. Phase 3 is next — run the §12 validation step first.
>
> **Milestones are named M0–M5.** They are *not* the same thing as `Brainstorm.md`'s
> roadmap Phases 1–5. In that numbering this entire document is Phase 2; M0–M5 are the
> steps inside it. Work them in order, ticking boxes as they land.

## 0. Where we actually are

**The schema is in. The wiring is not.** This is the single most important fact about
this wave, and it is easy to miss: `modules/scoring`, `questions.skill_code`,
`questions.difficulty`, the seeded `skills` tree, `student_profiles` and `mistakes` all
exist, are migrated and are backfilled — with **zero call sites anywhere in the
application**. Most of what follows is connecting things that are already built, not
building them.

| Piece | Schema | Wired | Evidence |
|---|---|---|---|
| `modules/scoring` (`toSectionScore`, `toTotalScore`, `pathFromModuleDifficulty`) | ✅ | ❌ **imported nowhere** | `modules/scoring/scaled-score.ts`; the only `./scoring` imports in the repo point at the *other* file, `student/scoring.ts` |
| `exams.scaled_score`, `mock_tests.{rw,math,total}_score` | ✅ `migrate.ts:437-440` | ❌ never written or read | `submitExam` sets only `status/score/completedAt/timeSpentSeconds` (`student/exams.service.ts:185-194`) |
| Browser score formula `200 + pct*600` | — | ⚠️ **still live, exactly 10 copies** | `Dashboard.tsx:34,35,47`, `Results.tsx:50,54,55,197,237`, `ExamDetail.tsx:169,171` |
| `skills` tree + `questions.skill_code` | ✅ seeded + backfilled `migrate.ts:421-432,481-498,513-514` | ❌ no reader, no writer | every consumer still branches on the 5-value `sub_skill` enum |
| Per-question `difficulty` | ✅ `migrate.ts:32,433` | ❌ never written, never read | question inserts at `teacher.service.ts:267,359` omit it |
| Math tagging | — | ❌ impossible in UI *and* in the classifier | select is `!isMath`-gated (`AddContent.tsx:855-869`); classifier filters `subject='english'` (`classification.service.ts:83-84`) |
| `student_profiles` | ✅ `migrate.ts:442-449` | ❌ no service, no route | Dashboard hardcodes `target = 1500` (`Dashboard.tsx:40`) |
| `mistakes` (+ unresolved partial index) | ✅ `migrate.ts:452-465` | ❌ nothing inserts | — |
| Set-less (topic) exams | ✅ **fully ready** | ❌ no assembler, no route | `set_id` already nullable + `order_index` added (`migrate.ts:471-472`); `createExamWithAnswerSheet({setId: null})` works (`exams/exam-provisioning.ts:31-63`); `findQuestionsForExam` already drives off the answer sheet (`student.repository.ts:48-56`) |
| Index `questions(skill_code)` | ✅ **already exists** `migrate.ts:466` | — | — |
| Per-skill analytics | — | ❌ absent | only `loadSubSkillBreakdown`, one exam, RW-only, for the AI prompt (`narrative.service.ts:62-82`) |
| Server timer | — | ❌ absent; client `timeSpentSeconds` is trusted and unvalidated | `exams.service.ts:191`, `student.schemas.ts:17,22` |
| Question versioning / audit log | ❌ | ❌ | `updateQuestion` edits in place; `deleteSet` cascades into attempt history |

Two schema notes worth carrying: `skills.parentCode` has no `.references()` in
`db/schema.ts:435` although the SQL does have the self-FK (`migrate.ts:425`), and both
indexes exist only in raw SQL — `db/schema.ts` declares no `index()` at all. Harmless at
runtime, but `drizzle-kit push` would want to recreate them.

## 1. Ground rules for this wave

- **Dependency order beats visibility.** Scoring and taxonomy come first because everything analytical sits on them.
- **Wording.** Every score shown is an *"Estimated SAT score"* or a *"Mock score"*, never an official one (Brainstorm §10).
- **No fake numbers.** If a section is too short to scale (`MIN_QUESTIONS_TO_SCALE = 10`) or data is too thin, show raw `x / y · z%` or "not enough data". The canonical offence is `estTotal = (estRW ?? 600) + (estMath ?? 600)` (`Dashboard.tsx:36`), which tells a student with **zero** completed exams that they scored 1200.
- **Schema changes go in one place.** Every new column is gathered into M0, so `schema.ts`/`migrate.ts` are touched once. New columns go in **both** files, and every ALTER is idempotent.
- **Organisations stay insurance.** Don't scope queries by `organization_id` in this wave (Brainstorm §5).
- **Repo conventions apply:** `try/catch` → 500 in handlers, `validateBody` + zod, `normalizeFileUrl()` on URLs, AI only via `ai.client.ts` and off the critical path, all HTTP via `shared/api/client.ts`, TanStack Query keys namespaced (`['student','mistakes',…]`), and TakeExam state mirrored to refs.

**Path corrections** — earlier drafts of this plan named these wrongly:

| Not this | This |
|---|---|
| `src/api/client.ts` | `frontend/src/shared/api/client.ts` (no top-level `src/api` exists) |
| `shared/components` | `shared/ui` (barrel `shared/ui/index.ts`: Button/Card/Badge/Input/Modal/Spinner) |
| `SUB_SKILLS` | `SUB_SKILL_OPTIONS`, a `{value,label}[]` (`features/teacher/constants.ts:9-15`) |

## 2. Bugs to fix before building on top

| # | Bug | Where | Fix | Lands in |
|---|---|---|---|---|
| B1 | A mock is marked `completed` when Math Module 2 is **issued**, not submitted. Combined with the never-written score columns, there is currently **no point in the lifecycle where a composite score could be computed** — so this blocks P2.1 outright. | `mock.service.ts:167-171` | Stop setting `status/completedAt` in `startNextModule`. Complete the mock in `finalizeMockIfComplete` (P2.1). | M0 |
| B2 | Teacher exam list `innerJoin(questionSets)` drops set-less exams. **Latent today** — no caller passes `setId: null` yet — but real the moment P2.5 lands. Note `getStudentExamResults` (`:115-122`) already handles a null `setId`, so the two functions are inconsistent. | `teacher.service.ts:77-80` | `leftJoin`. Label from `exams.label` (M0). | M0 (before M3 at the latest) |
| B3 | The mock results "1600" is **already broken**, not merely incomplete. `findSiblingExamIds` (`exams.service.ts:63-83`) only matches `mockTests.englishExamId`/`mathExamId` — the **M1** rows. After an adaptive run the student finishes on Math **M2**, which matches nothing, so `TakeExam.tsx:182` drops the `?englishExamId=` param, `isMockCombined` is false (`ExamDetail.tsx:37,70`), and the student sees a single-module `/800` report after a full four-module mock. | `exams.service.ts:63-83`, `ExamDetail.tsx:167-174` | P2.1's "`getResults` returns the parent `mockTest`" fixes the root cause. **Delete** the sibling-id shortcut rather than extending it. | M1 |
| B4 | Mock modules have **no timer at all**, not a wrong one. `20 * 60` is the `useState` seed (`TakeExam.tsx:32,47,68-69,127,142`) that mock modules never overwrite — the duration branch at `:107-118` is `isLiveExam`-gated (4200 s math / 3840 s english). The real test gives 32 min RW and 35 min Math. Copy drift too: `MockTest.tsx:51` advertises "45m total" for a 4 × 20 min run. | `TakeExam.tsx`, `MockTest.tsx:51` | Server-set limits (P2.7). | M5 |
| B5 | Enum mismatch: question difficulty is `easy/medium/hard` (a pgEnum, `migrate.ts:32`), set difficulty is `low/medium/hard` (`TEXT` + CHECK, `migrate.ts:308`, drizzle `schema.ts:77`). Both a value *and* a type mismatch. | — | **Keep both on purpose** (set difficulty drives adaptive routing, question difficulty drives topic practice). Document it in `backend/README.md` and never convert one into the other. | M0 (doc only) |
| B6 | **`getStudentExamResults` returns the student's raw `users` row — including `password_hash` — to the teacher client.** `assertOwnsStudent` does a bare `db.select()` and the row is passed through verbatim. | `teacher.service.ts:45-52` → `:125` | Select explicit columns in `assertOwnsStudent`. **Security — do this first.** | M0 |
| B7 | `updateQuestion` accepts `subSkill` but never touches `subSkillSource`, so a tag corrected in the normal editor stays `ai_suggested` and reappears in the AI Review queue. `createQuestion` gets this right (`:365`). | `teacher.service.ts:373-377` vs `:382-390` | Stamp `human_confirmed` on any manual tag write. | M2 |
| B8 | `importJsonSchema` has no `isDraft` and no set-level `difficulty`, so bulk-imported sets publish immediately (unlike `createSet`, which forces `isDraft: true` at `:194`) and are invisible to adaptive tier selection. | `teacher.schemas.ts:32-64` | Add both to the import schema. | M2 |
| B9 | `timeSpentSeconds` is validated as a bare `z.number().int().optional()` — negative and absurd values are accepted on both submit and autosave. | `student.schemas.ts:17,22` | `.min(0).max(…)`. One line; don't wait for P2.7. | M1 |
| B10 | `mockSectionRef` captures only the first render's `locationState?.mockSection` and is never re-synced by the reset effect (`:62-72`), yet `handleAdaptiveNextSection` branches on it (`:223,248`) while the render path reads the fresh value (`:375`). The two disagree after the first module transition. | `TakeExam.tsx:51` | Mirror it in the reset effect like every other ref. | M5 |

## 3. Milestones

| Milestone | Contents | Gate to start |
|---|---|---|
| **M0 — Foundation** ✅ | B6 (security, first), the genuinely-missing columns + `audit_log`, B1, B2, B5 doc | now |
| **M1 — Credible numbers** ✅ | P2.1 scaled scoring · P2.3 student profile · B3, B9 | M0 |
| **M2 — Taxonomy** ✅ | P2.2 taxonomy in authoring, import and AI · B7, B8 | M0 (parallel with M1) |
| **M3 — Student loops** ✅ | P2.4 mistake bank · P2.5 topic practice | M2 |
| **M4 — Analytics** ✅ | P2.6 analytics | M1 + M2 |
| **M5 — Integrity** ✅ | P2.7 server timer (+ B4, B10) · P2.8 versioning · P2.9 audit log | M0. **Pull P2.7 forward** if a consultancy is already treating mocks as assessments. |

M1 and M2 are the only pair that can genuinely run in parallel — they touch disjoint
files. Everything else is sequential.

---

### M0 — Foundation

**Depends on:** nothing · **Unblocks:** everything.
One migration PR, so feature work never touches `migrate.ts` again this wave.

- [x] **B6 (security, first):** `assertOwnsStudent` selects explicit columns (`id, name, email, role`), never the whole row (`teacher.service.ts:45-52`). Check every other bare `db.select()` on `users` while in there.
- [x] **B1:** drop `status: 'completed', completedAt` from the Math-M2 branch of `startNextModule` (`mock.service.ts:167-171`), leaving only `mathM2ExamId`.
- [x] **B2:** `innerJoin` → `leftJoin` in `listStudentExams` (`teacher.service.ts:77-80`); fall back to `exams.label` for the title.
- [x] `exams.label text` — display name for set-less exams ("Topic: Algebra", "Mistake review").
- [x] `exams.time_limit_seconds integer` + `exams.deadline_at timestamp` — for P2.7.
- [x] `questions.retired_at timestamp` + `questions.supersedes_id uuid` + `question_sets.archived_at timestamp` — for P2.8.
- [x] `audit_log (id, actor_id, action, target_type, target_id, payload jsonb, created_at)` — for P2.9.
- [x] All of the above in **both** `db/schema.ts` and `db/migrate.ts`, every statement idempotent.
- [x] Optionally close the drift: add `.references()` to `skills.parentCode` in `schema.ts:435`.

**Do not add** — already present and verified: the `skills` tree and seed, `questions.skill_code`,
`questions.difficulty`, `student_profiles`, `mistakes`, `exams.scaled_score`,
`mock_tests.*_score`, `questions_skill_code_idx`, nullable `exams.set_id`,
`exam_answers.order_index`.

**Verify:** boot the backend **twice** against the same DB — the second boot must be a
no-op. Existing exams still render. `npx tsc --noEmit` clean in `backend/`.

- [x] docs: `backend/README.md` — the B5 dual-difficulty rule, stated as a rule not a bug.

---

### M1 — Credible numbers (P2.1 + P2.3)

**Depends on:** M0 · **Unblocks:** M4, and every number a student sees.
**Goal:** one persisted score, computed server-side, that respects the adaptive path.

Backend
- [x] **B9:** clamp `timeSpentSeconds` in `student.schemas.ts:17,22` (`.min(0).max(…)`).
- [x] `submitExam` (`exams.service.ts:185-194`): after grading, set `scaledScore = toSectionScore(score, total, 'none')` for practice and live exams (null under 10 questions). **Mock modules keep `scaledScore = null`** — one module is not a section.
- [x] New `finalizeMockIfComplete(examId)` in `mock.service.ts`, called from `submitExam` once the exam is graded:
  - [x] find the mock containing this exam;
  - [x] if all four modules are `completed`: `raw = M1.score + M2.score`, `total = M1.total + M2.total`, `path = pathFromModuleDifficulty(M2 set difficulty)`;
  - [x] write `rwScore`, `mathScore`, `totalScore = toTotalScore(rw, math)`, `status='completed'`, `completedAt`, guarded by `WHERE status='in_progress'` so it is idempotent.
- [x] **B3:** `getResults` returns the parent `mockTest` (with its scores) when the exam belongs to a mock. **Delete `findSiblingExamIds`** (`exams.service.ts:63-83`) and the `?englishExamId=` round trip it feeds — it is the root cause, not a shortcut worth keeping.
- [x] `POST /admin/scoring/backfill` — admin-only, idempotent, fills only `NULL` rows, reusing the same functions so the formula is never duplicated in SQL. Copy the shape of the existing job: `admin.routes.ts:133-138` → `classification.service.ts:65-113` (synchronous, `BATCH_SIZE 20`, `BATCH_DELAY_MS 500`, `Promise.allSettled`, returns a counts summary). It blocks the request thread — acceptable at current corpus size; note it in the route comment.
- [x] Mocks wrongly marked `completed` by B1 get scores only if all four modules really are completed.

Frontend
- [x] Add `scaledScore` to `Exam`/`ExamWithSet` and `rwScore/mathScore/totalScore` to `MockTest` in `features/student/api/student.api.ts:36-64`.
- [x] Delete all **10** formula copies: `Dashboard.tsx:34,35,47`, `Results.tsx:50,54,55,197,237`, `ExamDetail.tsx:169,171`.
- [x] Also collapse the **three divergent** score→colour functions into one: `Dashboard.tsx:8-10` and `ExamDetail.tsx:23-25` use absolute 680/620/560, `Results.tsx:8-11` uses percentage 0.85/0.775/0.70.
- [x] New shared `formatScore` (+ the colour fn) in `shared/lib/` — renders `—` or raw `x/y` when null. Label every score **"Estimated"**.
- [x] `Dashboard.tsx`: headline from the latest completed mock's `totalScore`; **drop the `?? 600` fallback** (`:36`).
- [x] `Results.tsx`: sparklines read the scaled series.
- [x] `ExamDetail.tsx`: mock view reads the mock's own scores.

P2.3 — student profile
- [x] `GET`/`PUT /student/profile` in `student.routes.ts`. Zod: `targetScore` int 400–1600 in steps of 10; `testDate` ISO date or null. PUT upserts on the unique `student_id`.
- [x] The teacher student-detail response returns the profile too.
- [x] "Your goal" section in `student/pages/Settings.tsx` — slots in around `:253`. **Note:** the existing prefs there are `localStorage`-only (`sat-timer-pref`, `sat-font-pref`), so this is the first server-persisted student preference.
- [x] `Dashboard.tsx:40`: replace `target = 1500` with the profile value; gap = target − latest mock total, plus days to the test. No profile → a "Set your target" card, never a made-up gap.

**Verify:** take two full mocks, one aimed at the hard path and one at the low path — the
same raw 20/27 per module must score **higher** on the hard path (640 vs 530).
`grep -rn "\* 600" frontend/src` returns nothing. `grep -rn "1500" frontend/src/features/student/pages/Dashboard.tsx` returns nothing. Double-submitting the final
module doesn't change the score. A brand-new student with zero exams sees no number, not 1200.
Finishing a full adaptive mock lands on a combined 1600 report, not a `/800` one.

- [x] docs: `backend/README.md`, `flow.md` (scoring flow), `Brainstorm.md` §2

---

### M2 — Taxonomy (P2.2)

**Depends on:** M0 · runs in parallel with M1 · **Unblocks:** M3, M4.
**Goal:** every question, Math included, can carry a domain/skill and a difficulty.

> Scope warning: "add `skillCode` to zod" is roughly 10% of this milestone. The column is
> **completely unwired** — the dual-write plus reader migration is the real work.

Backend
- [x] New `modules/skills/skills.routes.ts` mounted at `/skills` (any authenticated role), added as one more `apiRouter.use(...)` in `modules/router.ts:18-26` **before** line 26 — the root `liveExamRouter` mount stays last.
  - [x] `GET /skills` returns the domain → skill tree from the `skills` table.
  - [x] `?withCounts=true` adds published-question counts per node, for topic practice.
- [x] `teacher.schemas.ts`: add `skillCode` (validated against `skills` in the service, 400 if unknown) and `difficulty` (`easy|medium|hard`) to create/update question **and** to `importJsonSchema:32-64`.
- [x] **B8:** add `isDraft` and set-level `difficulty` to `importJsonSchema` too.
- [x] **B7:** any manual tag write stamps `subSkillSource = 'human_confirmed'` (`teacher.service.ts:373-377`).
- [x] **Transition dual-write:** when `skillCode` is one of the five legacy codes, also write `subSkill`, and the reverse on the old path.
- [x] Then migrate the readers to `skillCode`, one at a time: `ai/ai.orchestrator.ts:48-54` · `student/narrative.service.ts:65-72` · `student/practice.service.ts:76,211-212` · `student/skill-passage.service.ts:38,82`.
- [x] Then stop writing `subSkill`. **Keep** the column this wave.
- [x] `admin/classification.service.ts`: extend to Math at domain level (four math domains). The English-only filter is at the **query** level (`:83-84`), so this is a query change, not just a prompt change. Writes `skillCode` + `subSkillSource='ai_suggested'`, through `ai.client.ts`, gated by `AI_MODEL_CLASSIFY`.
- [x] Admin dashboard stat: **tagging coverage** (% of published questions with `skillCode`, per subject). Analytics can only be as good as this number.

Frontend
- [x] `teacher/pages/AddContent.tsx:855-869`: replace the `!isMath`-gated select with a grouped domain → skill select fed by `/skills`, shown for **both** subjects.
- [x] Add per-question difficulty pills (none exist today — `Question` in `teacher.api.ts:36-53` has no `difficulty` field at all).
- [x] Point the confirm/override flow and the "untagged" filter at `skillCode` (`:1074-1103`; the `!isMath` gate is at `:1077`, chips at `:1091-1092`).
- [x] Bulk-import help panel with an example payload including `skillCode` and `difficulty`.
- [x] Retire `SUB_SKILL_OPTIONS` (`features/teacher/constants.ts:9-15`, one consumer: `AddContent.tsx:21,865`) once the tree is read from the API.
- [x] `student/pages/ExamCatalogue.tsx:57-71`: replace the hardcoded domain copy with `/skills`. `MockTest.tsx` has a second parallel `MODS` array — do both.

**Verify:** a teacher tags a Math question as Algebra/hard; the tag survives JSON import;
the AI classifier tags untagged Math questions into the review flow; correcting a tag in
the normal editor removes it from AI Review; the coverage stat appears.

- [x] docs: `backend/README.md`, `frontend/README.md`, `Brainstorm.md` §2

---

### M3 — Student loops (P2.4 + P2.5)

**Depends on:** M2 (both need tagged questions).

#### P2.4 Mistake bank — a self-draining worklist of every question missed

Backend
- [x] **Write path, in `submitExam` only** (submit is the authority; `confirmAnswer` flags get regraded there anyway):
  - [x] every graded answer with `isCorrect = false` upserts into `mistakes`: `ON CONFLICT (student_id, question_id)` bumps `miss_count`, `last_missed_at`, `exam_answer_id` and clears `resolved_at`. Blanks count as misses.
  - [x] a correct answer on a question with an open mistake sets `resolved_at = now()`.
- [x] **Live exams:** write mistakes on the teacher's **release**, not at submit — otherwise the bank reveals right/wrong before results are released.
- [x] `GET /student/mistakes?subject=&skillCode=&status=open|resolved` — question, skill, miss count, dates. Correct answer and explanation included (they come from completed exams).
- [x] `GET /student/mistakes/summary` — open counts per domain.
- [x] `POST /student/mistakes/practice { subject, skillCode?, limit≤20 }` — builds an exam from open mistakes via `createExamWithAnswerSheet({ setId: null, type: 'individual' })` with `label = 'Mistake review'`. Resolution then happens through the normal submit path.
- [x] v1 has **no** spaced repetition: rows resolve on one correct answer, ordered by `miss_count`, `last_missed_at`. **v2** (only if students re-miss resolved items often): add SM-2 columns and reuse `nextSchedule()` (`student/vocab.service.ts:43-57`).

Frontend
- [x] New `features/student/pages/Mistakes.tsx`; route at `app/router.tsx:95`, plus the import alongside `:14-21`.
- [x] Nav entries in **three** unshared literals in `layouts/StudentLayout.tsx` — rail `:8-56` (21px SVG), bottom bar `:248-253` (20px), More sheet `:305-308` (18px). The SVG must be re-pasted at all three sizes; budget for it.
- [x] Group by domain, filter by subject and status, "Practise these (N)" button starting the review exam in `TakeExam`.

**Verify:** a wrong mock answer appears in the bank; answering it correctly in a review
exam resolves it; missing it again reopens it with `miss_count = 2`.

#### P2.5 Topic practice

Backend
- [x] `POST /student/exams/topic { subject, skillCode, difficulty?, count 5-20 }`:
  - [x] random published questions (set not draft, not a live-exam set, question not retired) whose `skill_code` is the code **or one of its children**;
  - [x] prefers unseen questions, falls back to any;
  - [x] `createExamWithAnswerSheet({ setId: null })`, `label = 'Topic: <skill label>'`.
- [x] 400 with a clear message under 5 eligible questions. The UI uses `/skills?withCounts=true` to disable empty topics.
- [x] Check `findQuestionsForExam` attaches each English question's own passage when one exam spans several passages.
- [x] Confirm B2's `leftJoin` landed — set-less exams must appear on the teacher's view.

Frontend
- [x] "Practise by topic" block in `ExamCatalogue.tsx` — domain cards with counts (and accuracy once M4 lands), difficulty and count pickers.
- [x] `TakeExam` handles `setId = null`; `Results`/`Dashboard` show `exam.label` when `setTitle` is null.

**Verify:** a 10-question Algebra/medium exam grades, resumes from IndexedDB after a
mid-way reload, feeds the mistake bank, and shows up on the teacher's student view.

- [x] docs: `backend/README.md`, `frontend/README.md`, `flow.md`

---

### M4 — Analytics (P2.6)

**Depends on:** M1 + M2.
**Goal:** answer "why am I losing points?" and "am I improving?"

- [x] **Decide the charting question first.** `frontend/package.json` has **no** chart library. The only visualisation is a hand-rolled inline SVG sparkline declared *inside* the `Results` component body (`Results.tsx:57-73`), so it remounts every render. Either lift it into `shared/ui` as a real component or add a dependency — decide before writing the page, not halfway through it.

Backend — new `modules/analytics/analytics.service.ts`, pure query functions that take **a list of student ids**, so Phase 3 batch rollups reuse them unchanged.
- [x] `skillAccuracy(studentIds, { subject?, since? })` — joins `exam_answers → questions → skills` over completed exams (live exams only once released), groups by domain (`COALESCE(parent_code, code)`) and skill, returns attempted/correct/accuracy.
- [x] `scoreTrend(studentId)` — completed-mock `total/rw/math` and practice `scaledScore` over time.
- [x] `readiness(studentId)` — latest mock total, rolling average of the last 3, gap to target, days to test. Arithmetic, not a model (Brainstorm §4). Confidence "low" under 2 mocks.
- [x] `GET /student/analytics/overview` and `GET /teacher/students/:id/analytics` (behind `assertOwnsStudent`, `teacher.service.ts:45-53` — post-B6). Note `sendFeedback` (`:131-137`) inlines the same check instead of calling the helper; fold it in while here.
- [x] Replace `loadSubSkillBreakdown` (`narrative.service.ts:62-82`) with `skillAccuracy` scoped to one exam, so the AI narrative finally gets a Math breakdown instead of `- untagged: N wrong of M`.

Frontend
- [x] Progress view: score trend chart, domain accuracy bars weakest-first, readiness card.
- [x] Dashboard "Weakest domain" card linking straight into topic practice for that domain — this is the diagnose → practise loop.
- [x] Build these in `shared/ui` so teacher `StudentDetail.tsx` reuses them.
- [x] Hide accuracy for any domain with fewer than 5 attempts; show "not enough data".

**Verify:** a student with 2+ mocks sees a trend and a correct weakest domain, **including
Math**; the teacher sees the same numbers; both match a hand count on a small dataset.

- [x] docs: `backend/README.md`, `frontend/README.md`, `Brainstorm.md` §2

---

### M5 — Integrity (P2.7 + P2.8 + P2.9)

**Depends on:** M0. Needed before anyone pays for these scores.

#### P2.7 Server-authoritative timer (+ B4, B10)

- [x] Server-side constants: RW module 32 min, Math module 35 min. Live exams keep their session durations. Self-study practice stays untimed on the server (`time_limit_seconds = null`); the optional client timer is a convenience and those scores count as self-study.
- [x] `time_limit_seconds` set at exam creation. `deadline_at` stamped on **first open** (`getExam`), because Math M1 is created at mock start but taken later. Live exams: session `startedAt + duration`.
- [x] `getExam` returns `deadlineAt` + `serverNow`; the client computes the clock offset.
- [x] Autosave (`exams.service.ts:85-125`) ignores answer writes after `deadline_at + 30s` grace. For timed exams `timeSpentSeconds` is computed server-side and the client value ignored entirely.
- [x] **Lazy auto-close:** a timed exam past its deadline is graded and submitted when it is next read, listed, or needed by `startNextModule`. No scheduler.
- [x] `TakeExam.tsx`: count down to the server deadline instead of the `20 * 60` seed (`:32,47,68-69,127,142`); mirror it to a ref; IndexedDB resume uses the server deadline.
- [x] **B10:** re-sync `mockSectionRef` (`:51`) in the reset effect (`:62-72`) like every other ref.
- [x] Fix the copy: `MockTest.tsx:51` "45m total", `ExamCatalogue.tsx:75,139` and `Settings.tsx:246` all hardcode "20 minutes".

**Verify:** changing the device clock, tampering with `timeSpentSeconds`, or reloading
cannot extend a mock module; an abandoned module auto-submits on next read.

#### P2.8 Question versioning — the most important integrity debt (Brainstorm §9)

- [x] **Copy-on-write:** `updateQuestion` (`teacher.service.ts:371-379`) checks whether any completed exam references the question. If one does, insert a new row (`supersedes_id` = old), set `retired_at` on the old, and leave `exam_answers` pointing at the old row so history keeps its meaning. If nothing references it, edit in place as today.
- [x] Readers (`findQuestionsForSet`, the topic and mistake assemblers) filter `retired_at IS NULL`.
- [x] `deleteSet` (`teacher.service.ts:221-229`) archives (`archived_at`) instead of cascading whenever attempts exist. Today one teacher DELETE wipes graded exams via the FK chain `question_sets → exams → exam_answers → ai_feedback`.
- [x] Mock set selection (`mock.service.ts:30-48`) and the catalogues exclude archived sets.

**Verify:** editing a published question leaves a past attempt's results page unchanged.

#### P2.9 Audit log (small)

- [x] `logAudit(actorId, action, target, payload)` helper, called from admin user and role changes, access-code changes, DB restore, the SQL console (`database.service.ts:153-171` — unrestricted, no allowlist), and set archive/delete.
- [x] Read-only admin list view on the admin Dashboard.

- [x] docs: `backend/README.md`, `flow.md` (timer flow), `Brainstorm.md` §9

---

## 4. Phase 3 preview: consultancy layer (next wave, not started)

Unblocked only once P2.1, P2.2 and P2.6 have shipped. **First run the Brainstorm §12
step:** check with a consultancy that they would use the dashboard before building it.

- **Batches:** `batches (id, name, teacher_id, organization_id)` and `batch_members (batch_id, student_id)`. `assertOwnsStudent` also accepts batch membership. `users.teacher_id` stays.
- **Assignments:** `assignments (batch_id, kind: set|mock|topic, ref, due_at)`, attempts linked by exam id. Students get an "Assigned" list; teachers see completion per batch.
- **Batch analytics:** the M4 functions over member ids give average estimated total, % improving (first vs latest mock), weakest domain, below-target students, and at-risk students (inactive 14 days or a declining trend) — the Brainstorm §3 dashboard.
- **Reports:** a print-friendly student report route (`window.print()` → PDF, no PDF library) and a batch CSV export.
- **Content ownership:** `question_sets.created_by`, edits limited to owner or admin. Today ownership is deliberately global — any teacher can edit, publish or delete any set (`teacher.service.ts:36-39`, `assertSetExists:170-178`).

## 5. Explicitly not in this plan (Brainstorm §5)

Multi-tenant query scoping, billing/eSewa/Khalti, white-label/subdomains, public
signup/referrals/CRM, a counselor role, study plans (a presentation layer *after* P2.6),
and ACT/IELTS/university/visa.

## 6. Global verification gates

Per-milestone verification lives with each checklist above. These apply throughout:

- `npx tsc --noEmit` in `backend/` and `frontend/` for **every** item. There is no test suite and no linter; this is the only automated gate.
- Any migration change: boot the backend **twice** against the same DB to prove idempotence.
- Run the app to verify (`backend npm run dev` :3001, `frontend npm run dev` :5173) — never assume.
- Update the docs as each milestone lands: `backend/README.md`, `frontend/README.md`, `flow.md`, and the status tables in `Brainstorm.md` §2 and §9.
