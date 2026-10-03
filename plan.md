# plan.md — Staged roadmap (features from astra_ielts)

Reference repo: `../astra_ielts` (IELTS sibling platform). Detailed specs live in the appendices at the end.

## How stages work

1. Each stage gets its own branch `stage-N-<slug>`, cut from an up-to-date `main`. Open decisions for the stage are settled before coding starts.
2. Each item is ticked (`- [x]`) as soon as it is done and passes its checks.
3. When every item in a stage is ticked:
   - Local gates pass in both packages: `npx tsc --noEmit`, `npm run depcruise` and `npm run build`, plus backend `npm test`.
   - The app is run locally against a throwaway database and the stage's features are exercised by hand.
   - The stage is marked done in the table below and committed.
4. The branch is pushed and a PR is opened. GitHub Actions CI must be green.
5. A maintainer merges to `main`. The next stage starts only after that and an explicit go-ahead.

Legend: `- [ ]` to do · `- [x]` done · ⏸ waiting on a decision or out of scope for now.

| Stage | Scope | Branch | PR | Status |
|---|---|---|---|---|
| 0 | CI and test foundation | `stage-0-ci-tests` | [#1](https://github.com/Pratikmhrzn1/astra-sat/pull/1) | ✅ Merged (`d187ba7`) |
| 1 | Authentication (astra model) | `rewrite/stage1-backend` | merged to `main` (`194aa73`) | ✅ Done |
| 2 | Account lifecycle | `stage-2-account-lifecycle` | (opening) | ✅ Done, waiting on CI and merge |
| 3 | Admin and ops | — | — | Not started |
| 4 | Platform quality | — | — | Not started |

---

## Stage 0 — CI and test foundation

The repo has no CI and no test suite. This stage adds both, so every later stage can be verified automatically.

- [x] **CI workflow** `.github/workflows/ci.yml`. It runs on every push and pull request with one job per package: `npm ci`, `npx tsc --noEmit`, `npm run depcruise`, `npm run build`. The backend job gets a `postgres:16` service.
- [x] **Backend Vitest + supertest**. Adds an `npm test` script, `vitest.config.ts` and a test environment (`NODE_ENV=test`, a separate `DATABASE_URL`, dummy JWT secrets). Setup runs `applySchema()` and empties the tables between files. The app is built through `buildApp(apiRoutes)`, so tests never call `listen`.
- [x] **Email outbox for tests**. Under `NODE_ENV=test`, `core/lib/email.ts` keeps sent messages in memory instead of sending or printing them, so tests can read the verify and reset links.
- [x] **Identity test suite** covering the Stage 1 verification matrix (Appendix B, 1.7):
  - [x] Signup → verify → approve → login, including `EMAIL_NOT_VERIFIED` and `ACCOUNT_PENDING` along the way
  - [x] Verification and reset links: `INVALID_TOKEN`, `TOKEN_USED`, `TOKEN_EXPIRED`
  - [x] Lockout after 10 failures is stored in the DB, and admin unlock clears it
  - [x] Deactivation blocks refresh. Reject and reactivate work.
  - [x] Password reset revokes every session. Changing the password revokes every session except the current one.
  - [x] Account Creator makes active, verified teacher and admin accounts. Signup ignores access codes, including `000000`.
- [x] **CI runs `npm test`** in the backend job.
- [x] **Found and fixed by the tests:** expired password-reset links were still accepted when the DB session isn't UTC (as on the dev machines). `password_reset_tokens` is `TIMESTAMPTZ` in `migrate.ts` but was declared zone-less in Drizzle. The test DB is now pinned to `Asia/Kathmandu`, so CI catches this class of bug too.
- [x] **Docs**: CLAUDE.md's (local only, gitignored) "no test suite" line and Commands section, and `backend/README.md`, describe the test setup.

## Stage 1 — Authentication ✅

Spec: Appendix B. Committed as `194aa73` and merged to `main`.

- [x] 1.1 Database: `account_status` enum, status/verification/lockout/approval columns with backfills that run once, `email_verification_tokens`, hashed reset tokens, `000000` admin code no longer seeded
- [x] 1.2 Config: `EMAIL_VERIFICATION_TTL`, `PASSWORD_RESET_TTL`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`, a production warning when `RESEND_API_KEY` is unset
- [x] 1.3 Email: verification, reset and approved templates with HTML and text versions, escaped names, a console fallback, in-process retry. `mailWelcome` removed.
- [x] 1.4 Error codes: `code` field added to the error body
- [x] 1.5 Identity module: signup/verify/resend/sign-in/refresh/reset/change-password rewritten; admin approve, reject, deactivate, reactivate, unlock and resend; Account Creator
- [x] 1.6 Frontend: register, verify-email, login error codes, reset/forgot copy, admin Users page actions
- [x] 1.7 Manual verification on a throwaway DB copy (steps 1–7 and 9)
- [ ] 1.7 step 8: send real emails through a real `RESEND_API_KEY` and check the `/sat/...` links (needs a key, so it can't run in CI)

## Stage 2 — Account lifecycle

From astra's `admin.service.ts`, `platform-settings.ts` and `user-view.ts`.

**Decisions (settled 2026-10-03):**
- **D3, deleting users.** Before an account's expiry date, an admin can only *deactivate* it, which keeps its history. Once a trial or student account has expired, hard delete becomes available. Nothing is ever deleted automatically. Teachers and admins have no expiry, so they can only be deactivated.
- **Signup role.** The student picks Trial or Student on the register form. An admin still approves, and can convert Trial → Student later.
- **Existing accounts** get no expiry (`expiry_date` stays null), so the migration locks nobody out. Admins set dates one account at a time.
- **Daily limit day boundary** is midnight in Nepal time (Asia/Kathmandu), not UTC.
- Defaults (astra's): trial 14 days with 5 tests a day, student 60 days. Expiry counts from the signup date. New columns are `TIMESTAMPTZ`; Stage 0 showed why.

- [x] **2.1 Trial role**
  - [x] Backend: the `role` enum gains `trial`. A `LEARNER_ROLES` constant (`trial`, `student`) replaces the `requireAccountRole(['student'])` lists and the `role = 'student'` filters (roster, teacher assignment, stats).
  - [x] Backend: signup takes `role: trial | student` (default `student`), and sets `expiry_date` and `daily_test_limit` from platform settings
  - [x] Backend: daily test limit. Practice, topic, mistake-review and mock *starts* count per Nepal day; a mock counts once and live exams are exempt. `DAILY_LIMIT_REACHED` (429), plus `GET /student/daily-usage`.
  - [x] Frontend: Trial/Student choice at signup. Trial users reach every student page. A dashboard banner shows tests left today and days until expiry.
  - [x] Tests: trial users reach student routes, the limit is enforced and live exams don't count
- [x] **2.2 Account expiry**
  - [x] Backend: `users.expiry_date`; `assertUsable` → `ACCOUNT_EXPIRED` (login and refresh); a derived `effectiveStatus: 'expired'` that is never stored
  - [x] Backend: `PUT /admin/users/:id/expiry` and `PUT /admin/users/:id/daily-limit`, for trial and student accounts only
  - [x] Frontend: the admin can set and clear expiry and the daily limit. The Users page shows an "Expired" status. The login page has `ACCOUNT_EXPIRED` copy.
  - [x] Tests: an expired account can't log in or refresh; clearing the expiry restores access
- [x] **2.3 Convert trial → student**
  - [x] Backend: `POST /admin/users/:id/convert`. Expiry = signup date + student days, the limit is removed, `converted_at` is stamped, and `inPast` warns when the new expiry has already passed.
  - [x] Frontend: a Convert action on the admin Users page, with the in-past warning
  - [x] Tests
- [x] **2.4 Platform settings**
  - [x] Backend: a single `platform_settings` row, seeded from `TRIAL_DURATION_DAYS` / `TRIAL_DAILY_TEST_LIMIT` / `STUDENT_DURATION_DAYS` the first time it's read; `GET`/`PUT /admin/platform-settings`
  - [x] Frontend: an admin "Platform settings" page
  - [x] Tests
- [x] **2.5 Delete only after expiry** (D3)
  - [x] Backend: `DELETE /admin/users/:id` returns `409 DELETE_NOT_ALLOWED` unless the account is a trial or student whose expiry has passed
  - [x] Frontend: Delete is disabled with an explanation until the account has expired; Deactivate is the default action
  - [x] Tests
- [x] **Found while testing:** a trial converted to student got an expiry 5h45m late on a non-UTC database. `users.created_at` is zone-less and filled by the DB's `NOW()`. Signup now stamps `created_at` from the app, and a test catches the drift.
- [x] **Also:** `platform_settings` is included in backups. The admin dashboard's audit feed labels the new actions. Your dev DB `sat_restore` was migrated by the running dev server, and all 29 existing accounts have no expiry.

## Stage 3 — Admin and ops

- [ ] **3.1 AI cost time series**: a summary plus a 7d/30d/90d series (astra's `ai-costs.service.ts`), shown as a chart on the admin dashboard
- [ ] **3.2 Three-part streamed backup**: users+attempts JSON, content JSON and an uploads `tar.gz`, streamed as downloads. Today uploads are left out of backups.
- [ ] **3.3 Dev seed**: `npm run seed` already exists (`core/db/seed.ts`). It should refuse to run in production and also create a trial account (after 2.1).
- [ ] **3.4 Teacher media library**: astra's `media` module and `MediaPicker`, for images on questions and passages
- [ ] Tests for each item above

## Stage 4 — Platform quality

- [ ] **4.1 More tests**: `modules/exams` grading and scaled score, the riskiest code according to `README.md`
- [ ] **4.2 Email/job queue**: BullMQ + Redis for email and the post-response AI work. Needs Redis in `docker-compose.yml` and `deploy.sh`.
- [ ] **4.3 Cross-device exam resume**: drafts saved on the server (`PATCH /:id/draft`, `GET /current`). Changes `TakeExamPage` and must follow the ref-mirroring rule.
- [ ] **4.4 History tabs** ⏸ UI work, waits until UI changes are back in scope: Practice / Mock / Live, one row per exam with a link to a section breakdown

Out of scope until asked for: astra's sidebar navigation and "Test Engine v2" visual system. The UI stays as it is for now.

---

# Appendix A — Where the two repos differ (as of Stage 1 planning)

| Concern | SAT today | astra_ielts | Phase 1 target |
|---|---|---|---|
| Who can sign up | Anyone with an **access code**. The code sets the role. | Public signup. No code. | astra |
| After signup | Logged in immediately | `201 {message}`, **no tokens** | astra |
| Email verification | None | Required. Hashed single-use token, 24h TTL. | astra |
| Admin approval | None | Required. `status: pending → active` | astra |
| Account status | None (hard delete only) | `pending / active / rejected / deactivated` | astra |
| Welcome email | Sends the **plaintext password** | None | Removed |
| Failed-login lockout | In-memory `LockoutRegistry`, keyed by email, lost on restart | `users.failed_login_attempts` + `locked_until` columns | astra |
| Status checked on login/refresh | No | `assertUsable()` on both | astra |
| Reset tokens | Stored **raw** | sha256 hash | astra |
| Reset/change password | Leaves other sessions alive | Reset kills all sessions. Change kills all but the current one. | astra |
| Resend with no API key | Silent no-op | Prints the email to the console | astra |
| Error contract | `{ error: string }` | `{ error: { code, message } }` | Keep SAT's shape and **add a `code` field** (see 1.4) |
| Refresh rotation | Rotation plus a 30s grace map for multi-tab races | Rotation. Reuse revokes every session. | **Keep SAT's.** It's strictly better for multi-tab use. |
| Email transport | Direct Resend call | BullMQ + Redis queue → Resend | Direct call with in-process retry (no Redis yet, see 1.3) |

**Security issue found during this review:** `core/db/migrate.ts` (`SEED_DEFAULT_ADMIN_CODE`) seeds an active **admin** access code `000000` on every boot when there isn't one. Anyone who knows it can register as an admin. Phase 1 closes this hole because signup stops reading access codes.

# Appendix B — Stage 1 spec: Authentication (astra model, Resend, unchanged UI)

### 1.1 Database (`core/db/schema/identity.ts`, `enums.ts`, `migrate.ts`)

Per CLAUDE.md, every column goes in **both** the Drizzle schema and `migrate.ts`. `migrate.ts` runs on every boot, so each statement must be idempotent. **Backfills must run once only**, so use the guarded `DO $$ … IF NOT EXISTS` pattern that `survey_completed_at` already uses (`migrate.ts:607`).

- **Enum** `account_status`: `pending | active | rejected | deactivated`. Create it with `CREATE TYPE … EXCEPTION WHEN duplicate_object`.
- **`users` (`accountsTable`) new columns:**
  - `status account_status NOT NULL`. In a guarded block: add it with `DEFAULT 'active'` so existing accounts stay usable, then `ALTER COLUMN status SET DEFAULT 'pending'`.
  - `email_verified_at TIMESTAMP`. In a guarded block: add it, then `UPDATE users SET email_verified_at = created_at` so existing accounts count as verified.
    ⚠️ Don't make this an unguarded `UPDATE … WHERE email_verified_at IS NULL`. That would run on every boot and silently verify every new signup.
  - `failed_login_attempts INT NOT NULL DEFAULT 0`, `locked_until TIMESTAMP`
  - `approved_at TIMESTAMP`, `approved_by UUID REFERENCES users(id) ON DELETE SET NULL`
  - Index on `status`, because the admin filters on it.
- **New table `email_verification_tokens`**: `id, user_id → users ON DELETE CASCADE, token_hash UNIQUE, expires_at, consumed_at, created_at`, plus an index on `user_id`. It copies astra's `emailVerificationTokens`.
- **`password_reset_tokens`**: keep the `token` column but **store the sha256 hash in it** from now on. This needs no migration. Any raw tokens still outstanding stop matching, and they expire within an hour anyway. Don't add a `DELETE` to `migrate.ts`, because on every boot it would wipe valid tokens.
- **Seeding:** delete `SEED_DEFAULT_ADMIN_CODE`. The seed script (`npm run seed`) must insert its admin and student accounts as `status='active'` with `email_verified_at=now()`.

### 1.2 Config (`core/config/env.ts`, `.env.example`)

New variables, with astra's defaults:

| Var | Default | Use |
|---|---|---|
| `EMAIL_VERIFICATION_TTL` | `24h` | Verification link lifetime |
| `PASSWORD_RESET_TTL` | `1h` | Already hard-coded in the service. Moves here. |
| `LOGIN_MAX_FAILED_ATTEMPTS` | `10` | Lockout threshold. Same as today's constant. |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout window |

- Email links are built from `PUBLIC_BASE_URL`. It already includes `/sat`, and the frontend is served under the `/sat/` base. Remove the hard-coded fallback `https://mocktest.niec.edu.np/sat` in `core/lib/email.ts`, and fall back to `FRONTEND_URL` in dev.
- At boot, log a **loud warning** in production when `RESEND_API_KEY` is unset. Without it nobody can verify an email, so every signup gets stuck.

### 1.3 Email (`core/lib/email.ts`)

Copy astra's `services/email/{client,templates,send}.ts` into SAT's single file, keeping SAT's existing visual template (orange header, NIEC footer):

- `deliver(to, rendered)`: when there's no Resend key, **log the subject, recipient and text body (including the link) to stdout** instead of skipping silently. Without this, dev signups can't finish. Otherwise call `resend.emails.send` and throw on `{ error }`, as the current `send()` already does.
- Every template gets both `html` and `text`, and `escapeHtml(name)`. The current templates interpolate `name` unescaped.
- Templates:
  - `mailEmailVerification(to, name, token)` links to `${base}/verify-email?token=…`
  - `mailPasswordReset(to, name, token)` keeps today's design, now with TTL text from config
  - `mailAccountApproved(to, name)` is a small SAT addition, sent when an admin approves an account. astra doesn't have this, but otherwise users have no way to learn they can sign in. Drop it if strict parity matters.
  - **Delete `mailWelcome`.** It emails the plaintext password.
- **Transport:** astra uses BullMQ + Redis. SAT has no Redis, and adding it means a docker-compose and `deploy.sh` change. For Phase 1, call `deliver` without awaiting it, after the DB write, with **3 attempts and exponential backoff** (5s, 10s, 20s) in-process, and log the final failure. The send helpers keep astra's names and signatures so a later move to a queue is a one-file change (Phase 4).

### 1.4 Error codes (`core/errors.ts`, `core/http/middleware/error.ts`)

astra's frontend switches on machine-readable codes. SAT's body is `{ error: string, ...meta }`, and the frontend reads `response.data.error`, so **keep that and add `code`**:

- Add an optional `code?: string` to `ServiceError`, passed by the factories (`notPermitted(msg, code)` and so on). `errorResponder` adds `code` to the body when it's set. Existing callers don't change.
- Codes to use (astra's): `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_PENDING`, `ACCOUNT_REJECTED`, `ACCOUNT_DEACTIVATED`, `ACCOUNT_LOCKED`, `INVALID_TOKEN`, `TOKEN_USED`, `TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `NOT_PENDING`, `CANNOT_TARGET_SELF`.
- Status codes: a lockout is `401 ACCOUNT_LOCKED` with `{ minutesRemaining }` in meta (astra), replacing today's `429`. The account gates are `403`.

### 1.5 Identity module (`modules/identity/`)

**`auth.schemas.ts`**
- `registerRules`: `{ email, name, phone (required, 3–30 chars), password (8–128) }`. The `accessCode` field is removed (decision D1). `name` stays a single field, because the UI keeps it (D2).
- Add `verifyEmailRules { token }` and `resendVerificationRules { email }`.
- `resetPasswordRules` keeps `{ token, password }`, because the frontend already sends `password`.

**`auth.repository.ts`**
- Add `status`, `emailVerifiedAt`, `failedLoginAttempts`, `lockedUntil` to the row it reads.
- New: `addVerificationToken`, `loadVerificationTokenByHash`, `latestVerificationToken(userId)`, `markEmailVerified(tx)`, `recordLoginFailure`, `clearLoginFailures`, `revokeAllRefreshTokens(userId, exceptHash?)`.
- `addPasswordResetToken` and `loadUnexpiredResetToken` take a **hash**. The service now deletes the user's older reset tokens before it issues a new one (astra).
- The `PublicAccount` returned to clients gains `status` and `emailVerified`. `/me` returns them.

**`auth.service.ts`**: port astra's `auth.service.ts` function by function, keeping SAT's names:

| SAT function | New behaviour (astra) |
|---|---|
| `signUp` | Reject a taken email (`409 EMAIL_TAKEN`, and also catch the unique-violation race). Insert `role='student', status='pending'`, hash the password, issue a verification token (32 random bytes hex, store the sha256), and send the verification email. **Return nothing.** No session is issued. |
| *new* `confirmEmail(token)` | Look up the token by hash. Reject unknown (`INVALID_TOKEN`), consumed (`TOKEN_USED`) and expired (`TOKEN_EXPIRED`) tokens. In one transaction, set `consumed_at` and set `email_verified_at` where it's still null. |
| *new* `resendVerification(email)` | Always succeeds silently. Do nothing when the account is unknown, already verified, rejected or deactivated, or when the last token is under 60s old (resend throttle). Otherwise issue a new token and email it. |
| `signIn` | Unknown email: compare against `DUMMY_HASH` (constant time), then `INVALID_CREDENTIALS`. Locked account: compare against the dummy, then `ACCOUNT_LOCKED`. Wrong password: increment `failed_login_attempts` and set `locked_until` at the threshold, and a counter whose lock window has passed starts again from 0 (astra's `nextFailureState`). Correct password: **`assertUsable(user)`**, clear the counters, issue a session. |
| *new* `assertUsable(user)` | Checks in order: not verified → `EMAIL_NOT_VERIFIED`, then `pending` → `ACCOUNT_PENDING`, `rejected` → `ACCOUNT_REJECTED`, `deactivated` → `ACCOUNT_DEACTIVATED`. |
| `renewSession` | Keep SAT's rotation and grace map, and **also call `assertUsable`** after loading the user. A deactivated account then drops out within one access-token TTL (15 min). |
| `beginPasswordReset` | Generic success. Skip unknown or deactivated accounts. Delete the user's old reset tokens, store the hash, send the email. |
| `completePasswordReset` | Hash the incoming token before lookup. In one transaction: mark the token used, set the password, **delete every refresh token for the user**. |
| `replacePassword` | Also revoke every refresh token except the current one. The route passes the `rt` cookie in. |

- Replace the `DUMMY_HASH` placeholder string with a real one generated at boot: `bcrypt.hashSync(random, 12)`. A malformed hash can short-circuit `bcrypt.compare` and expose a timing difference.
- Remove `LockoutRegistry` from auth. Leave `core/lib/rate-limit.ts` alone, because the AI budget may still use it.

**`auth.routes.ts`**
- `POST /register` → `201 { message }`, with no cookie and no tokens.
- `POST /verify-email` and `POST /resend-verification`, both unauthenticated, both behind `authLimiter`.
- The rest stay where they are.
- **Keep the `express-rate-limit` volume guard (`authLimiter`).** astra has no IP limiting at all, because NIEC users share public IPs. SAT's guard is 200 requests per 15 min and runs in production only. astra drops even that. Keep it or drop it (D4).

**Admin user lifecycle (`users.routes.ts` / `users.service.ts`)**: the approval half of astra's flow. All of these are admin-only and audit-logged through `modules/audit`:

| Endpoint | Behaviour |
|---|---|
| `GET /admin/users?status=` | Existing list, plus `status`, `emailVerified`, `locked` and a status filter |
| `POST /admin/users/:id/approve` | `pending → active`, stamps `approved_at/by`, sends `mailAccountApproved`. A non-pending account gets `409 NOT_PENDING`. |
| `POST /admin/users/:id/reject` | `pending → rejected` |
| `POST /admin/users/:id/deactivate` | `→ deactivated` and revokes all refresh tokens. An admin can't target themselves (`CANNOT_TARGET_SELF`). |
| `POST /admin/users/:id/reactivate` | `deactivated → active` |
| `POST /admin/users/:id/unlock` | Clears `failed_login_attempts` and `locked_until` |
| `POST /admin/users/:id/resend-verification` | Re-sends the link on the student's behalf |
| `POST /admin/users` | **Account Creator** (astra): an admin creates a teacher or admin with a password. The account is born `active` and verified. It replaces teacher access codes as the way teachers get accounts (D1). |

The existing `DELETE /admin/users/:userId` stays for now (D3).

### 1.6 Frontend (behaviour only, existing look kept)

All new markup reuses the existing class recipes from `shared/ui` (`alertStyle`, `fieldStyle`, …) and the current two-panel auth layout. No new design.

- **`shared/api/http.ts`**: add `fetchApiErrorCode(err): string | undefined`, which reads `response.data.code`. When a refresh fails with an `ACCOUNT_*` or `EMAIL_NOT_VERIFIED` code, sign out the way an invalid session already does.
- **`features/auth/api.ts`**: `signUp(email, name, password, phone)` → `{ message }`. New `verifyEmail(token)` and `resendVerification(email)`. `SessionAccount` gains `status?` and `emailVerified?`.
- **`RegisterPage.tsx`**: remove the access-code field. That's the only visible change, and it disappears if D1 goes the other way. Phone becomes required. On success, **don't log in**: swap the form for an `alertStyle` notice, "Check your email — verify your address, then an administrator will approve your account", plus a link back to sign in. `EMAIL_TAKEN` gets its own message.
- **New `VerifyEmailPage.tsx`** at `/verify-email`: reads `?token=`, POSTs once on mount (guard against StrictMode's double effect), and shows verifying, success ("Email verified — an administrator will review your account") or an error. On `TOKEN_EXPIRED` it offers a resend form, which is just an email input. The shell is the same as `ResetPasswordPage`. Register it in `app/router.tsx` next to the other public auth routes.
- **`LoginPage.tsx`**: map error codes to astra's copy (`INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_PENDING`, `ACCOUNT_REJECTED`, `ACCOUNT_DEACTIVATED`, `ACCOUNT_LOCKED` with `minutesRemaining`). On `EMAIL_NOT_VERIFIED`, show an inline "Resend verification email" link that calls `resendVerification`.
- **`ResetPasswordPage.tsx` / `ForgotPasswordPage.tsx`**: show the `TOKEN_USED` and `TOKEN_EXPIRED` copy. Nothing else changes.
- **`features/admin/pages/UsersPage.tsx`**: a functional addition inside the existing table styling: a status pill column, a "Pending" filter, and per-row actions for approve, reject, deactivate, reactivate, unlock and resend verification. Plus a "Create teacher/admin" form, following the access-codes page form pattern. Endpoint wrappers go in `features/admin/api.ts`, with TanStack keys under `['admin','users']`.
- **`AccessCodesPage.tsx`**: leave it reachable but labelled as legacy, or hide its nav entry (D1).

### 1.7 Rollout and verification

There are no automated tests, so the gates are `npx tsc --noEmit` and `npm run depcruise` in both packages, plus a manual walkthrough on a copy of production data (`sat-prep-backup-*.json` restored locally):

1. Boot twice on an existing DB. Existing users are `active` and verified after the first boot. The second boot changes nothing: no re-backfill, and the `pending` default still holds.
2. Register. You get `201` with no cookie. The dev console shows the verify link. Login now returns `EMAIL_NOT_VERIFIED`.
3. Open the link to verify. Login now returns `ACCOUNT_PENDING`. Reusing the link gives `TOKEN_USED`.
4. Approve as admin. The approval email is logged. Login succeeds and routes to the student dashboard.
5. Ten wrong passwords give `ACCOUNT_LOCKED`. A restart keeps the lock. Admin unlock clears it.
6. Deactivate a logged-in user. Within 15 minutes the next refresh fails and they're signed out.
7. Forgot and reset password: the old link fails, other sessions are revoked, and the new password works.
8. Run once with a real `RESEND_API_KEY` and check that the verify, reset and approved emails arrive with working `/sat/...` links.
9. Confirm the `000000` admin access code no longer works and is no longer re-seeded.

Deploy is through `deploy.sh`, which deletes the source tree, so deploy from a clean clone. Add the new env vars to the server's `backend/.env` first.

### 1.8 Decisions to confirm before coding

| # | Question | Default in this plan |
|---|---|---|
| **D1** | Access codes: retire them from signup (strict astra), or keep them as an optional fast track where a valid code skips admin approval and sets the role? | **Retire.** Teachers come from the Account Creator. The table stays and isn't dropped. |
| **D2** | One `name` field (current UI) or astra's `firstName` + `lastName`? | **Keep `name`**, per "keep the UI as it is" |
| **D3** | Keep hard delete of users, or follow astra ("deactivate only, never hard delete")? | Keep delete for now and add deactivate. Revisit in Phase 2. |
| **D4** | Keep the production-only IP volume limiter on auth routes? | **Keep** |
| **D5** | Send an "account approved" email (SAT addition)? | **Yes** |
