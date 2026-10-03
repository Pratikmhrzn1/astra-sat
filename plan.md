# plan.md — Features from astra_ielts

Reference repo: `../astra_ielts` (IELTS sibling platform).
Branch: work starts from `rewrite/stage1-backend`.

> **Status (2026-10-03): Phase 1 is implemented and uncommitted**, with the defaults in 1.8. It was verified against a throwaway copy of the dev DB: migration backfill, an idempotent second boot, the full signup → verify → approve → login flow, lockout surviving a restart, deactivation, reset and change password, the Account Creator, and an old-backup restore. Additions beyond this plan: (a) `shared/api/http.ts` no longer runs the refresh-and-retry interceptor on `/auth/login` and friends (previously a wrong password surfaced as "No refresh token"); (b) a restore of a pre-Phase-1 backup brings users back active and verified instead of all pending; (c) verification-token `created_at` is stamped from JS, because the local DB runs in Asia/Kathmandu and the zone-less `NOW()` default broke the resend cooldown.

**Phase 1, authentication, is the committed scope.** Login and signup copy astra_ielts's model: email verification through Resend, then admin approval, a database-persisted account lockout, and tokens that are hashed at rest. **The UI stays as it is.** The existing auth pages keep their layout and styling, and only what they do changes. Phases 2–4 are a backlog of astra ideas, ordered by value. Each one needs its own go-ahead.

---

## 0. Where the two repos differ today

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

---

## Phase 1 — Authentication (astra model, Resend, unchanged UI)

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

---

## Phase 2 — Account lifecycle (builds on Phase 1)

From astra's `admin.service.ts`, `platform-settings.ts` and `user-view.ts`.

1. **Trial role.** Public signup picks `trial` or `student`, as astra does. A trial account has an `expiry_date` and a `daily_test_limit` (practice and mock starts per UTC day, with mock sections exempt as in astra). This needs `role` to become `trial | student | teacher | admin`, and every `requireAccountRole(['student'])` (~12 routers) must accept `trial`. Add a `LEARNER_ROLES` constant instead of editing the lists one by one.
2. **Account expiry.** `users.expiry_date`. `assertUsable` adds `ACCOUNT_EXPIRED`, and `effectiveStatus` is derived, never stored. The admin can set or clear it.
3. **Convert trial → student.** Expiry is computed from the *original signup date* (astra's rule), and the admin is warned when the result is already in the past.
4. **Platform settings.** A single `platform_settings` row (trial days, trial daily limit, student days), editable by the admin, lazily seeded from env (astra's `getSettings`).
5. **No hard delete** (if D3 flips): replace `DELETE /admin/users/:id` with deactivate, so student attempt history is never lost.

## Phase 3 — Admin and ops

1. **AI cost time series.** astra's `ai-costs.service.ts` adds a summary plus a 7d/30d/90d time series. SAT's `/admin/ai-model-stats` only aggregates per model. Add the time series and a chart on the admin dashboard.
2. **Three-part streamed backup.** astra streams users+attempts JSON, content JSON and an uploads `tar.gz` as downloads, never writing to disk. SAT's backup is one JSON with no uploaded files, so uploads are currently lost from backups.
3. **Dev seed accounts.** A `npm run seed:dev` that refuses to run when `NODE_ENV=production`, and creates a pre-verified, pre-approved student (and trial). With Phase 1 in place, local testing otherwise means approving yourself every time.
4. **Teacher media library.** astra's `media` module and `MediaPicker` let teachers attach uploaded images to questions and passages, instead of pasting URLs into the content editor.

## Phase 4 — Platform quality

1. **Test suite.** astra has Vitest with a real Postgres test DB and in-memory outboxes for email and jobs (99 tests). Start with `identity` (the whole Phase 1 matrix above), then grading and scaled score in `modules/exams`, which is the riskiest code according to `README.md`. Update CLAUDE.md's "no test suite" line.
2. **Email/job queue.** Move email and the post-response AI work (narratives, skill passages) onto BullMQ + Redis, as astra does, for retries and visibility. This needs a Redis service in `docker-compose.yml` and `deploy.sh`. The Phase 1 send helpers already have queue-ready signatures.
3. **Cross-device exam resume.** SAT keeps in-progress answers in best-effort IndexedDB. astra autosaves drafts server-side (`PATCH /:id/draft`) and serves `GET /current`, so a student can continue on another device. That's a `TakeExamPage` change, and it has to follow the ref-mirroring rule.
4. **History tabs.** Practice / Mock / Live, where Mock and Live show one row per exam that links to a section breakdown (astra's History page). This is a UI change, so it waits until UI work is back in scope.

Out of scope until asked for: astra's sidebar navigation and "Test Engine v2" visual system. The UI stays as it is for now.
