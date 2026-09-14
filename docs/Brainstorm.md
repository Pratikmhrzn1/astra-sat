# SAT Mock Exam Platform — Product Brief & Build Roadmap

> **Status of this document.** The previous version of this brief was written as a greenfield
> plan — it instructed the reader to design the architecture and "build the test engine" before
> writing production code. That premise no longer holds: the platform is built, deployed, and in
> use. Phase 1 of the old roadmap is essentially done.
>
> This revision keeps the product vision, the business model and the market thinking, and replaces
> the greenfield planning sections with three things the old document could not provide: **where
> the product actually stands today**, **what is genuinely missing**, and **what we are
> deliberately not building yet, with reasons**.
>
> Where this document and the code disagree, the code wins. See `README.md`, `flow.md`,
> `backend/README.md` and `frontend/README.md` for implementation detail.

---

## 1. Positioning

A **digital SAT preparation and mock-exam platform**, initially for students and education
consultancies in Nepal.

This is not "an online SAT mock test website." The long-term goal is a **B2B2C SAT assessment and
student-success platform**:

- **Students** diagnose weaknesses, practise, take realistic digital SAT mocks, and improve.
- **Consultancies** assess students, assign tests, manage batches, monitor performance, and report.
- Value comes from the combination of **test engine + performance data + personalisation +
  consultancy workflow**.

> **Core positioning** — Realistic SAT testing + actionable performance intelligence for students
> and education consultancies.
>
> **Consultancy positioning** — Test. Diagnose. Coach. Track. Convert.

### The questions the product exists to answer

**For a student:** What is my current SAT level? What score am I likely to get? Why am I losing
points? Which topics should I practise? Am I improving? Am I ready for my target score?

**For a consultancy:** Who has been tested? What is each student's current score? Who is below
target? Who is improving? Who needs intervention? What should each batch be assigned? How is each
batch performing?

### The competitive principle

Do not compete on question count or mock count. The differentiator is:

> **"We don't just tell students their score. We explain what to improve, and we give consultancies
> the data to help them improve."**

---

## 2. Where the product actually is today

### Built and working

| Area | Status |
|---|---|
| **Exam engine** | Solid. The answer sheet is materialised at exam creation (row per question), grading is server-side and never trusts a client score, and submission is idempotent. This is the hard part, and it is done. |
| **Adaptive mocks** | Four chained timed modules — English M1 → English M2 → Math M1 → Math M2 — with the Module-2 difficulty chosen by a ≥60% threshold on Module 1. The adaptive step is idempotent, so a reload or double-submit mid-transition is safe. |
| **Practice** | Per-question-set practice with an optional timer, per-question "confirm" for immediate feedback. |
| **Durability** | Answers write to IndexedDB immediately and sync to the server every 30s, plus an immediate flush when the browser comes back online. Practice exams resume from local storage. |
| **AI feedback** | Six feedback types (reasoning checkpoint, grammar diagnosis, trap explainer, command of evidence, transitions coach, vocab drill), cache-first, rate-limited per student, always off the critical path. |
| **AI tutor chat** | Per-question multi-turn chat scoped to the question and passage, with an off-topic filter. |
| **Post-test narrative** | AI-generated diagnosis with a per-sub-skill breakdown after each exam. |
| **Live in-class exams** | Teacher creates a session with a 6-character join code; students join a polling lobby; timing is server-anchored so a reload cannot buy extra time; the teacher writes per-question feedback and explicitly releases results. |
| **Vocabulary SRS** | SM-2 spaced repetition over both question-sourced and teacher-curated words. |
| **Content authoring** | Teacher Content Manager: passages, questions (MC and student-produced response), rich text, math toolbar, bulk JSON import, image attachment. |
| **Admin tooling** | User management, access codes, AI cost/latency stats, generated-content review queue, DB backup/restore/SQL console. |
| **Scaled scoring** *(M1)* | Server-side 200–800 section and 400–1600 mock scores that respect the adaptive path, persisted and backfilled on boot. Never invented: a section under 10 questions reports raw `x / y`. |
| **SAT taxonomy** *(M2)* | Four domains per section with skills beneath, Math included; per-question difficulty; the AI classifier tags both subjects. |
| **Mistake bank & topic practice** *(M3)* | Every missed question lands in a self-draining worklist; exams assembled from a domain or skill across sets. |
| **Analytics** *(M4)* | Accuracy by domain and skill, a score trend over mocks and practice, and one estimated score (latest mock, else latest practice per section) shared by Dashboard, Progress and the teacher's view. |

Several requirements from the old brief's "Technical Quality" section are already met: autosave,
resilience to refresh and network loss, idempotent submission, reproducible server-side grading,
and correct answer-key handling (keys are never sent to the client during an exam — only during
server-side grading and after completion).

### The three gaps that mattered

> **Status:** gaps 1 and 2 are closed (M1, M2), and gap 3's analytics layer exists (M4).
> Batches and assignments remain — that is Phase 3. See `plan.md` for what landed. The text
> below is kept as the record of why the work was sequenced this way.

**1. There is no real SAT score.**

The server stores only a raw count of correct answers. No 400–1600 total, no section scores, nothing
persisted. Every score a student sees is computed in the browser by one line —
`Math.round(200 + (score / totalQuestions) * 600)` — copy-pasted ten times across three pages, next
to a hardcoded `target = 1500`.

This is wrong in three ways:

- **It contradicts the adaptive design.** A linear stretch of raw percentage ignores which Module 2
  the student earned. A student routed to the *hard* module and one routed to the *easy* module get
  the same score for the same raw percentage — even though the entire purpose of the adaptive step
  is that those performances are not equivalent.
- **It cannot be aggregated.** Because nothing is persisted server-side, none of the analytics this
  brief asks for are computable: target gap, readiness, improvement trend, batch averages, at-risk
  detection, score distribution.
- **It is in the wrong layer** — scoring logic living in React components.

The only server-side score estimate that exists today is a free-text guess from a language model
(`"scoreRange": "620–660"`), which may come back null.

**2. The skill taxonomy is five values, and Math has none.**

Questions can be tagged with one of five sub-skills — grammar, inference, command of evidence,
vocabulary in context, transitions. All five are Reading & Writing. **Math questions cannot be
tagged at all.** There is no domain column, and difficulty is free text on the question *set*, not
the question.

The real Digital SAT structure is four domains per section:

```
Math                                    Reading & Writing
  Algebra                                 Information and Ideas
  Advanced Math                           Craft and Structure
  Problem-Solving and Data Analysis       Expression of Ideas
  Geometry and Trigonometry               Standard English Conventions
```

Today those names appear in exactly one place in the codebase: hardcoded marketing copy on the
exam catalogue page.

Everything analytical is blocked on this — mistake categorisation, topic practice, weakness
analysis, batch domain rollups, study plans. Building any of them on the current tagging means
building on sand.

**3. There is no grouping beyond one teacher per student, and no analytics layer at all.**

A student has a single `teacherId`. There are no batches, no assignments, no memberships. The
teacher portal is entirely per-student: a flat roster, one student's exam list, one exam's
questions. There is no analytics module in the backend; the only per-skill aggregation in the whole
system runs over a single exam and exists solely to fill an AI prompt.

### One integrity gap *(closed in M5)*

> **Status:** closed. Mock modules and live sections now have server-held deadlines, late writes are
> refused and abandoned modules auto-submit (M5 / P2.7). Practice stays untimed by design.

Practice and mock timers are client-side. The server accepts whatever elapsed time the client
reports and never checks it against the exam's start time, and no deadline is enforced. Only live
exams are server-anchored. This is fine for self-study and not fine the moment a consultancy reports
these scores as an assessment.

---

## 3. Sequencing: why student data comes before the consultancy dashboard

The old brief ranked revenue priority as **1. Consultancy SaaS, 2. Student Premium**, and put
student analytics behind organisation accounts. That ordering is right commercially and wrong
technically, because the consultancy dashboard it describes —

```
Students              284
Tests this month      491
Average score        1228
Students improving     72%
Weakest domain:  Advanced Math
```

— is **literally uncomputable today**. Every number in it is an aggregate over per-student scaled
scores and per-skill accuracy, and neither exists.

The consultancy dashboard is a *view over student data*. You cannot build the view before the data.

So the sequencing below is not a demotion of the B2B goal. It is the shortest path to it.

---

## 4. What we are building now

Ordered by dependency, not by visibility.

| # | Item | Why now |
|---|---|---|
| 1 | **Server-side scaled scoring** — persist a 400–1600 total and both section scores, computed from a conversion table that takes the adaptive Module-2 path as an input | The headline promise, and the hard dependency of everything analytical |
| 2 | **Real SAT domain/skill taxonomy**, covering Math, with per-question difficulty | Foundation for topic practice, the mistake bank, and all analytics |
| 3 | **Student profile** — target score and test date | Replaces a hardcoded 1500; unlocks gap and readiness framing |
| 4 | **Mistake bank** — missed questions collected, categorised by domain, re-practisable | The most-requested student feature; depends on 2 |
| 5 | **Topic practice** — practise by domain and skill, not only by whole set | Depends on 2 |
| 6 | **Analytics** — per-skill accuracy and score trend over time | Depends on 1 and 2; nothing exists today |
| 7 | **Server-authoritative timer** | Integrity, before anyone pays for these scores |

### Three reframings that save real work

1. **The diagnostic is not a new subsystem.** The old brief described it as a separate product
   surface. It is a *shorter mock with a different set configuration* — the adaptive engine,
   answer-sheet provisioning, grading and narrative already handle it.
2. **The mistake bank has a working precedent to copy.** Vocabulary already implements SM-2 spaced
   repetition, and wrong answers are already counted per skill to trigger remediation passages.
   Generalise those patterns rather than inventing a new scheme.
3. **"Readiness score" and "score gap" are not features.** They are arithmetic over items 1 and 3.
   Cheap once those exist; guesswork before.

---

## 5. What we are deliberately not building yet

This section exists because the most expensive mistake available to this project is building
consultancy SaaS scaffolding before a second consultancy exists.

| Parked | Why | What would unpark it |
|---|---|---|
| **Multi-tenancy / organisations** | Retrofitting an org boundary across every table, query and permission check is weeks of work and risk for a deployment serving one consultancy. *Cheap insurance is being taken now:* a nullable organisation reference on users and one default organisation row, so the eventual migration is additive rather than a rewrite. Queries are **not** scoped yet. | A second consultancy signs. |
| **Billing / subscriptions** | The prices in §7 are explicitly hypotheses. No payment integration exists. Building an eSewa/Khalti checkout before a signed customer is building a till for a shop nobody has agreed to enter. | A consultancy agrees to pay. |
| **Batches, assignments, batch analytics** | Genuinely valuable and genuinely validated — consultancies do run batches. But every batch metric is an aggregate over scaled scores and skill accuracy, so it is strictly downstream of items 1, 2 and 6. Building it first would produce a dashboard of empty columns. | Items 1, 2 and 6 land. This is the next wave. |
| **White-label, custom subdomains** | The old brief's own P2 tier. Meaningless without multi-tenancy. | Multi-tenancy. |
| **Lead generation, referrals, CRM** | Blocked by something more basic: registration is access-code gated and there is no public landing page, so there is no funnel to attribute. Opening self-serve signup is a business decision, not a ticket. | A decision to open public signup. |
| **Counselor role** | A fourth role widens the permission surface for a need the teacher view already covers. | A consultancy asks for it specifically. |
| **Study plans** | A presentation layer over analytics. Cheap after item 6, guesswork before it. | Item 6 lands. |
| **ACT, IELTS, university matching, visa workflow** | Do not build during the first SAT product. | SAT product-market fit. |

Also still true from the old brief, and worth restating: **do not build** a full study-abroad CRM, a
university database, live classes, native mobile apps, a marketplace, a large gamification system,
or an over-complicated chatbot.

---

## 6. Roles and permissions

Three roles exist today: **student**, **teacher**, **admin**.

- **Student** — take tests, practise, view own results, mistakes and progress, manage own profile.
- **Teacher** — view own students, author content, send feedback, run live exams.
- **Admin** — manage users, access codes, content review, platform operations.

Two known shortcomings, neither urgent at one consultancy, both blocking at two:

- **Content is owned by nobody.** Any teacher may edit any question set. Fine within one
  organisation, untenable across two.
- **There is no organisation boundary.** All data is global to the deployment.

A **counselor** role is described in §5 as parked. **Organisation Owner/Admin** becomes meaningful
only with multi-tenancy.

---

## 7. Business model

Unchanged from the previous brief, and still **hypotheses for validation, not fixed prices**.

**B2B2C.** Recommended revenue priority: consultancy SaaS → student premium → white-label →
usage/AI add-ons → qualified leads. A consultancy can introduce dozens or hundreds of students
through one relationship, which makes B2B distribution more efficient than acquiring students
individually.

- **Free student tier** — one diagnostic, limited practice, basic score, limited analytics.
- **Student premium** — NPR 699–1,499/month hypothesis: full mocks, topic practice, mistake bank,
  detailed analytics, AI assistance.
- **Consultancy SaaS** — Starter NPR 3,000–5,000 · Growth NPR 7,500–12,000 · Enterprise
  NPR 15,000–30,000+ per month, scaling on student capacity, batch management, analytics depth,
  custom tests and branding.
- **Per-student pricing** — NPR 200–500 per active student/month, for consultancies that prefer
  usage-based terms.
- **AI credits** — meter AI usage if it becomes a meaningful variable cost. Per-model cost and
  latency are already tracked, so the data to decide this exists.
- **Qualified leads** — only once there is enough organic traffic.

Validate pricing against actual demand and competitor research before launch.

---

## 8. Nepal market adaptation

NPR pricing · eSewa/Khalti/Fonepay where the final payment stack supports them · Nepali time zone ·
consultancy-first distribution · tolerance for low-bandwidth connections · strong desktop experience
for mock testing · mobile-responsive dashboards for counselors and owners · easy PDF/report sharing ·
simple organisation onboarding · local support.

Do not sacrifice product quality to make the product cheap.

---

## 9. Technical quality requirements

Requirements for the test engine, with current status:

| Requirement | Status |
|---|---|
| Answers autosave reliably | **Met** — IndexedDB immediately, server every 30s, flush on reconnect |
| State survives refresh / network interruption | **Met** — practice, mock and live sections all resume saved answers; timed sections re-anchor to the server deadline |
| Submissions are idempotent | **Met** |
| Scores are reproducible | **Met** — raw grading and persisted scaled scores |
| Answer keys not exposed to the client | **Met** — keys appear only in server-side grading and post-completion results |
| Question order/version preserved per attempt | **Met** — the answer sheet fixes order, and an attempted question is versioned rather than edited |
| Timer authoritative server-side | **Met** for mocks and live exams; practice is untimed on the server by design |
| Published questions immutable/versioned | **Met** — copy-on-write once attempted; sets with attempts archive instead of deleting |
| Organisation data isolated | **Not applicable yet** — single tenant |
| Audit important administrative actions | **Met** — user, access-code, database and set-removal actions, read-only list on the admin dashboard |

All closed in M5 except tenancy, which waits for Phase 3.

---

## 10. Content and copyright

Do not copy official College Board SAT questions, passages, explanations, trademarks or proprietary
material without rights. Use properly licensed or independently authored SAT-aligned content.

Clearly distinguish official material, third-party licensed material, platform-authored material and
AI-generated practice material. The platform already flags AI-generated content and holds it in a
review queue before it goes live — keep that gate.

**Never present a platform-generated score as an official SAT result.** Use "estimated SAT score",
"practice score" or "mock score" in all copy.

---

## 11. North Star metrics

**Student** — diagnostic completion, mock completion, weekly active students, mocks per student per
month, practice sessions, return rate, score improvement, target achievement rate.

**Consultancy** — active organisations, students per organisation, tests per organisation per month,
teacher activity, student retention, churn, ARPO, trial→paid conversion.

**Business** — MRR, ARR, CAC, LTV, churn, gross margin, AI cost per student, payment processing
cost, revenue per student, revenue per consultancy.

Note that most *student* metrics above become computable only once scaled scoring and the taxonomy
land — which is another way of stating the argument in §3. AI cost per student is already
measurable today.

---

## 12. Validation plan

1. Ship scaled scoring, the real taxonomy and topic analytics — the point at which the product can
   actually answer "why am I losing points?"
2. Recruit a small group of Nepal-based students.
3. Interview SAT teachers and consultancy owners.
4. Test whether consultancies will actually use a dashboard — before building the dashboard.
5. Test willingness to pay for organisation accounts.
6. Observe which analytics they actually use, and cut the rest.
7. Refine pricing on evidence.

A small number of real consultancy pilots is worth more than dozens of unvalidated features.

---

## 13. Roadmap

**Phase 1 — SAT core.** *Substantially complete.* Test engine, adaptive mocks, practice, grading,
AI feedback, live exams, content authoring.

**Phase 2 — Make the data real.** *Current wave.* Scaled scoring, SAT domain/skill taxonomy, student
profile with target score, mistake bank, topic practice, analytics, server-authoritative timer.

**Phase 3 — Consultancy layer.** Batches, assignments, batch analytics, teacher dashboards, student
and batch reports. Unblocked by Phase 2.

**Phase 4 — Multi-tenancy and commerce.** Organisations, content ownership, subscription and billing
foundation, branding. Triggered by a second consultancy.

**Phase 5 — Growth.** Public funnel, referral attribution, white-label, lead generation.

---

## 14. Final principle

The first release must answer one question extremely well:

> **"Can this platform accurately assess where an SAT student is today, and clearly tell them — and
> their consultancy — what to do next?"**

Today the platform assesses well and explains individual questions well. It cannot yet state a
credible score or name a weak domain in Math. Phase 2 is precisely the work of closing that gap, and
nothing in Phase 3 or beyond is worth starting until it is closed.
