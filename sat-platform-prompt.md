# SAT Platform — Feature Gap-Fill Prompt

## How to use this file

Read the entire file before touching any code. Then read the existing SAT codebase
thoroughly — both `frontend/` and `backend/` — and identify what is already present
versus what is missing. Implement only what is missing. Do not re-implement, refactor,
or rename anything that already works. Confirm understanding of the existing structure
before writing a single line.

---

## Tech stack (do not deviate)

**Frontend**
- React 18.2, Vite 5.2, TypeScript 5
- React Router v6 (file-based routing or however it is already set up — follow the existing pattern)
- TanStack Query v5 for all server state (queries + mutations)
- Zustand for global client state (auth store, etc.)
- Axios for HTTP (follow the existing apiClient/axios instance)
- Tailwind CSS 3 (follow existing component patterns)

**Backend**
- Express 4.18, TypeScript 5
- Drizzle ORM 0.30 + `pg` 8.11 (Neon hosted PostgreSQL)
- `tsx` for dev hot-reload
- JWT auth (`jsonwebtoken`), `bcryptjs`, `zod`, `helmet`, `express-rate-limit`
- **Express 4 does NOT propagate async errors automatically** — every async route handler must wrap its body in `try/catch` and call `next(err)` in the catch block

---

## What is already built — skip these unless something is incomplete

- Auth: register / login / logout / token refresh
- Student portal shell and routing
- Teacher portal shell and routing
- Admin portal shell and routing
- Teacher question input into the database
- Database admin panel (backup / restore / migrations)

For each of those areas, read what exists and fill in any gaps described below rather
than re-implementing from scratch.

---

## Features to verify and implement

Work through each section below. For each one: read existing code first, confirm whether
it is already there, then implement whatever is missing.

---

### 1. Auth system — verify these specific details

The broad auth flow may already be present, but confirm every point below is correctly
implemented. Patch anything that is missing.

#### Access code registration

All accounts (student, teacher, admin) must be created with an access code. No one
registers without one. The code determines the resulting role.

**Lookup order:**
1. Query the `access_codes` table for an active code matching the submitted value.
2. Check `maxUses` — if `maxUses IS NOT NULL` and `usageCount >= maxUses`, reject with
   "This access code has reached its usage limit".
3. If a DB code matches: set role from `codeRow.role`, increment `usageCount`.
4. If no active DB code matches: reject with "Invalid or inactive access code".

#### JWT tokens

- **Access token**: short-lived (15 min to 1 hr), signed with `JWT_ACCESS_SECRET`, payload
  `{ sub: userId, role }`. Sent as `Authorization: Bearer <token>` header.
- **Refresh token**: 7-day lifetime, signed with `JWT_REFRESH_SECRET`, payload includes a
  random `jti` nonce (`crypto.randomBytes(16).toString('hex')`) to guarantee uniqueness
  even when two tokens are minted within the same second for the same user.
- **Storage**: refresh token is set as an httpOnly cookie restricted to path `/api/auth`
  (so it is NOT sent with every API request, only to the refresh endpoint). Cookie is
  `sameSite: 'none'` + `secure: true` in production, `sameSite: 'lax'` + `secure: false`
  in development/HTTP. Honour a `COOKIE_SECURE=false` env var override for HTTP reverse-
  proxy deployments.
- **DB storage**: store SHA-256 hash of the refresh token, never the raw token.
  `crypto.createHash('sha256').update(token).digest('hex')`
- **Rotation**: on every `/api/auth/refresh` call, delete the old hashed token and insert
  a new one (inside a DB transaction). This is token rotation — a stolen refresh token
  can only be used once.

#### Multi-tab refresh token race condition

When two browser tabs both have an expired access token and fire `/api/auth/refresh`
simultaneously, only one can win the DB transaction. The loser finds the token already
consumed and would normally get a 401 → force logout. Prevent this with a short in-memory
grace window:

```typescript
const recentlyRotated = new Map<string, { accessToken: string; expiresAt: number }>();
const GRACE_MS = 30_000;
```

After a successful rotation, store `{ accessToken: newAccessToken, expiresAt: Date.now() + GRACE_MS }`
keyed by the **old** token's hash. Clean up after 30 s with `setTimeout`.

Before hitting the DB, check this map. If the old token hash is present and unexpired,
return the cached access token — the losing tab gets the same new access token as the
winner without being logged out.

Inside the transaction, use `.returning()` to detect whether the DELETE actually removed
a row. If 0 rows deleted, another request won the race — wait 50 ms then check the grace
map again; if still not there, return 401.

#### Timing-attack-safe login

When a user with the given email does not exist, still run `bcrypt.compare` against a
dummy hash so the response time is identical whether the email exists or not:

```typescript
const hash = user?.passwordHash ?? '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXX';
const valid = await bcrypt.compare(body.password, hash);
if (!user || !valid) throw AppError.unauthorized('Invalid email or password');
```

#### Bcrypt cost factor

Always use **12 rounds** (`bcrypt.hash(password, 12)`).

#### GET /api/auth/me

A route that verifies the access token and returns the current user's profile from the
DB. Used by the frontend on app startup to validate a stored token and hydrate the auth
store without re-logging in.

#### POST /api/auth/logout

Requires authentication. Reads the refresh token cookie, deletes its hash from the DB,
clears the cookie, returns 200. Gracefully handles missing cookie (still returns 200).

---

### 2. Middleware and utilities

These utility files should exist and be used consistently throughout all routes.

#### `utils/errors.ts` — AppError class

```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(msg: string, code?: string) { return new AppError(400, msg, code); }
  static unauthorized(msg = 'Unauthorized')      { return new AppError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Forbidden')            { return new AppError(403, msg, 'FORBIDDEN'); }
  static notFound(msg: string)                   { return new AppError(404, msg, 'NOT_FOUND'); }
  static internal(msg = 'Internal server error') { return new AppError(500, msg, 'INTERNAL_ERROR'); }
}
```

#### `utils/response.ts` — consistent response shape

All routes must return `{ success: true, data: ... }` for success and
`{ success: false, error: { code, message } }` for errors.

```typescript
export function ok<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}
export function created<T>(res: Response, data: T): void { ok(res, data, 201); }
export function noContent(res: Response): void { res.status(204).send(); }
```

#### `middleware/errorHandler.ts` — global error handler

Must handle `AppError` (return its statusCode + code + message), `ZodError` (return 400
with per-field issues — use `err.issues.map(i => ({ field: i.path.join('.'), message: i.message }))`
and also include `err.flatten().fieldErrors` for backward compat), and unknown errors
(log to console, return 500 with a sanitised generic message — never leak stack traces).

Register as the last middleware in `app.ts`:
```typescript
app.use(errorHandler);
```

#### `middleware/auth.ts`

`authenticate` middleware: reads `Authorization: Bearer <token>`, calls `verifyAccessToken`,
attaches `req.user = { id, role }`. Calls `next(AppError.unauthorized(...))` on failure.

`requireRole(...roles)`: returns a middleware that calls `next(AppError.forbidden(...))` if
`req.user.role` is not in the provided list. Always apply `authenticate` first.

```typescript
export interface AuthenticatedRequest extends Request {
  user: { id: string; role: string; };
}
```

---

### 3. Security and rate limiting

#### Helmet

```typescript
app.use(helmet());
```

Apply before all routes. Helmet sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc).

#### CORS

Restrict to `FRONTEND_URL` env var. Never use `*` in production.

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // needed for the refresh token cookie
}));
```

#### Trust proxy

If running behind a reverse proxy (Render, nginx, any cloud), set:
```typescript
app.set('trust proxy', 1);
```
Without this, `express-rate-limit` sees the proxy IP for every request and limits the
wrong address.

#### Rate limiters

Limiters should be **no-ops in development** (`NODE_ENV !== 'production'`) to avoid
burning through limits during HMR reconnections and React StrictMode double-renders.

```typescript
const isDev = process.env.NODE_ENV !== 'production';
const pass: RequestHandler = (_req, _res, next) => next();

// General API — applied globally
export const generalLimiter = isDev ? pass : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,  // generous — school deployments share one WiFi IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please slow down' } },
});

// Auth endpoints
export const authLimiter = isDev ? pass : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,   // 30 students logging in simultaneously from one school IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts' } },
});
```

Apply `generalLimiter` globally in `app.ts` (after health check, before routes).
Apply `authLimiter` specifically to auth routes (register, login).

#### Body size limit

```typescript
app.use(express.json({ limit: '20mb' }));
```

#### Input validation

Every route that accepts a request body must validate it with Zod before any DB access.
Use `.parse()` (throws ZodError on failure, which the global error handler converts to a
clean 400 response). Strip control characters from any user-supplied text that will be
stored or displayed.

---

### 4. Super Admin panel

The admin portal should have a tabbed interface with the following sections. Read the
existing admin portal — if tabs/sections already exist, only add what is missing.

#### 4a. Dashboard / Stats tab

`GET /api/superadmin/stats` — returns counts for the admin dashboard:
```json
{ "students": 42, "teachers": 5, "submissions": 310, "assignments": 38 }
```

Query `users` table filtered by role for student/teacher counts. Query `submissions` for
total. Query `teacher_students` for assignment count.

#### 4b. Users tab

Full user management. All routes under `/api/superadmin/*` require `authenticate` +
`requireRole('admin')`.

- `GET /api/superadmin/users?role=student|teacher|admin` — list all users, optional role
  filter. Return: `id, name, email, role, createdAt`. Order by `createdAt DESC`.
- `GET /api/superadmin/users/:id` — single user detail.
- `PUT /api/superadmin/users/:id/role` — change a user's role. Zod: `{ role: enum(['student','teacher','admin']) }`.
  Block changing your own role (`req.user.id === id` → 400).
- `PUT /api/superadmin/users/:id/name` — admin edits a user's display name. Block editing
  your own name this way.
- `POST /api/superadmin/users/:id/reset-password` — admin resets a user's password.
  Zod: `{ newPassword: string min 8 max 128 }`. Hash with bcrypt (12 rounds). Also delete
  all `refresh_tokens` for that user to invalidate their active sessions immediately.
  Block resetting your own password through this endpoint.
- `DELETE /api/superadmin/users/:id` — delete a user. Block self-deletion. Before
  deleting the `users` row, manually delete child records that do NOT have `ON DELETE CASCADE`
  in the schema (check each FK). Return 204.

UI: table of users with role badge, search/filter by role, inline actions (change role,
reset password, delete). Confirm dialog before destructive actions.

#### 4c. Assignments tab (teacher ↔ student)

Schema: `teacher_students` table with columns `id uuid PK`, `teacher_id uuid FK→users`,
`student_id uuid FK→users`, `assigned_at timestamp default now()`. Add a unique constraint
on `(teacher_id, student_id)`.

- `GET /api/superadmin/assignments` — all assignments enriched with teacher and student
  name/email (fetch users separately and build a map — avoid N+1). Order by `assigned_at DESC`.
- `POST /api/superadmin/assignments` — Zod: `{ teacherId: uuid, studentId: uuid }`.
  Validate teacher has role teacher/admin, student has role student, they are not the same
  person. Use `.onConflictDoNothing()` — if already assigned, fetch and return the existing row.
- `DELETE /api/superadmin/assignments/:id` — remove assignment. Return 204.
- `GET /api/superadmin/teachers` — all non-student users (for dropdowns in the UI).

UI: a dropdown to pick teacher + student → assign button. Table of existing assignments
with a remove button. Show teacher and student name + email.

#### 4d. Access Codes tab

Schema: `access_codes` table with columns `id uuid PK`, `code varchar(100) UNIQUE`,
`role varchar(20) NOT NULL` (student/teacher/admin), `description text`, `is_active boolean NOT NULL DEFAULT true`,
`max_uses integer` (nullable — null means unlimited), `usage_count integer NOT NULL DEFAULT 0`,
`created_at timestamp DEFAULT now()`.

- `GET /api/superadmin/access-codes` — all codes, ordered by `created_at DESC`.
- `POST /api/superadmin/access-codes` — Zod: `{ code: string min 4 max 100 trimmed, role: enum, description?: string max 300, maxUses?: number positive int | null }`.
  Check uniqueness before insert.
- `PUT /api/superadmin/access-codes/:id` — partial update (`accessCodeSchema.partial()`).
  Used to toggle `isActive`, change `maxUses`, update description.
- `DELETE /api/superadmin/access-codes/:id` — delete a code. Return 204.

UI: form to create a code (code string, role selector, optional description, optional max
uses). Table showing code, role, usage count vs max, active status toggle, delete button.

#### 4e. Platform Feedback tab

Schema: `platform_feedback` table with columns `id uuid PK`, `user_id uuid NOT NULL FK→users ON DELETE CASCADE`,
`category varchar(20) NOT NULL DEFAULT 'other'` (enum: `bug | suggestion | other`),
`message text NOT NULL`, `is_read boolean NOT NULL DEFAULT false`,
`created_at timestamp NOT NULL DEFAULT now()`.

Backend routes:

- `POST /api/feedback` — any authenticated user submits feedback. Zod: `{ category: enum default 'other', message: string min 10 max 2000 trimmed }`. Return 201 with `{ id }`.
- `GET /api/feedback` — admin only (`requireRole('admin')`). Returns all rows joined with
  `users` for `name` and `email`. Order by `created_at DESC`.
- `PATCH /api/feedback/:id/read` — admin marks a feedback entry as read (`is_read = true`).
- `DELETE /api/feedback/:id` — admin deletes a feedback entry.

Student portal UI: a "Send Feedback" button visible in the student sidebar/nav. Opens a
modal with a category picker (Bug Report / Suggestion / Other), a textarea (min 10, max
2000 chars with a live character count), and a send button. Show a success screen after
submission. Category picker and message field only — no title field needed.

Admin UI: a Feedback tab in the admin panel. Each entry shows submitter name/email, category
badge (color-coded: red for bug, yellow for suggestion, grey for other), timestamp, and the
message. Support expand/collapse for long messages. Mark-as-read on expand. Delete button
(stopPropagation so it doesn't trigger the expand toggle). Filter by category / unread.

#### 4f. Database tab

This may already exist. Verify the following are all present and correct.

**Content backup** (`GET /api/admin/backup`): downloads a JSON file containing all content
tables (question banks, cue cards, passages, etc. — whatever content tables exist in the
SAT schema). Include `mock_question_sets` and `library_items` if those tables exist.

**Content restore** (`POST /api/admin/restore`): accepts the JSON backup. Validates
`version === 1`. Inside a DB transaction, delete content tables in reverse FK dependency
order, then re-insert from backup in FK dependency order. Use chunked inserts (50 rows
per batch) to avoid PostgreSQL's 65535-parameter limit. Convert ISO date strings back to
`Date` objects before inserting (Drizzle's pg driver calls `.toISOString()` on timestamps
and throws if they are already strings).

```typescript
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const reviveDates = (rows: any[]) =>
  rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'string' && ISO_RE.test(v) ? new Date(v) : v;
    }
    return out;
  });
```

For tables that have FK references from user data (e.g. `mock_question_sets` referenced
by `exam_sessions`): use `onConflictDoNothing()` instead of delete-then-insert, to avoid
silently nulling FK columns in user-data rows. Null out `created_by` / `uploaded_by`
columns on restore since user IDs may not be present when content is restored in isolation.

**User backup** (`GET /api/admin/user-backup`): downloads a JSON file containing all user
data — `users`, `submissions`, `access_codes`, `teacher_students`, `teacher_feedback`
(teacher→student), `mock_exams` (student exam history), `exam_sessions`, `exam_participants`,
`exam_responses` — whatever user-owned tables exist in the schema. Includes password hashes.

**User restore** (`POST /api/admin/user-restore`): validates `version === 1, type === 'user-backup'`.
Deletes all user data in reverse FK order (explicit delete before `users` for any table
that has cascade — do it explicitly to be clear about ordering). Then re-inserts in FK
dependency order (users first, then dependent tables). Note in a code comment: if
`exam_sessions` references content tables (question sets), the content restore must be
run before the user restore on a fresh DB.

**Run Migrations** button: `POST /api/admin/migrate` — runs pending Drizzle migrations
programmatically using Drizzle's migrator. Requires admin role. Returns 200 on success.

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';

const migrationsFolder = path.resolve(__dirname, '../../drizzle');
await migrate(db, { migrationsFolder });
```

UI buttons: Download Content Backup, Upload & Restore Content, Download User Backup,
Upload & Restore Users, Run Migrations. Warn clearly before destructive restores. Show row
counts from the restore response. File input restricted to `.json`.

---

### 5. Teacher portal — student management and feedback

#### Teacher-scoped student list

`GET /api/teacher/students` — returns students assigned to the requesting teacher.
```typescript
// Join teacher_students → users
.where(eq(teacherStudents.teacherId, req.user.id))
```
Teachers should only ever see data for their assigned students. Any route that retrieves
student submissions, results, or profiles for a teacher must enforce this scoping — check
the assignment exists before returning data, throw 403 if not assigned.

#### Teacher → student feedback

Schema: `teacher_feedback` table with columns `id uuid PK`, `teacher_id uuid NOT NULL FK→users`,
`student_id uuid NOT NULL FK→users`, `target varchar(50)` (optional tag like 'writing',
'speaking', 'general'), `message text NOT NULL`, `created_at timestamp NOT NULL DEFAULT now()`.

- `GET /api/admin/feedback/:studentId` — available to teachers and admins. Teachers: verify
  `teacher_students` contains a row for `(teacher_id = req.user.id, student_id = studentId)`
  before returning. Admin: no restriction.
- `POST /api/admin/feedback` — teacher or admin posts feedback. Zod: `{ studentId: uuid, target?: string max 50, message: string min 1 max 2000 }`.
  Teacher must be assigned to that student (check assignment, throw 403 if not).

Student portal UI: display teacher feedback received on the student's dashboard or a
dedicated "Feedback" section. Show teacher name, target/topic, message, and date.

---

### 6. Digital library

This is a shared resource library where teachers/admins upload files (PDFs, images,
audio, video) and students can browse and access them.

**Schema**: `library_items` table with columns `id uuid PK`, `title varchar(200) NOT NULL`,
`description text`, `file_url text NOT NULL`, `file_type varchar(20) NOT NULL`
('audio'|'video'|'image'|'document'|'other'), `mime_type varchar(100)`,
`file_name varchar(300)`, `uploaded_by uuid FK→users ON DELETE SET NULL`, `hidden boolean NOT NULL DEFAULT false`,
`created_at timestamp NOT NULL DEFAULT now()`.

The table stores **metadata only** — the actual file is stored wherever the upload service
puts it (Cloudinary, S3, local disk). The `file_url` is the accessible URL.

Backend routes under `/api/library`:

- `GET /api/library` — authenticated, any role. Returns non-hidden items (`hidden = false`)
  for students and teachers; returns ALL items (including hidden) for admin. Include
  `uploaded_by` user name if available (left join).
- `POST /api/library` — teacher or admin only. Zod: `{ title, description?, fileUrl, fileType, mimeType?, fileName? }`.
  Sets `uploadedBy = req.user.id`.
- `PATCH /api/library/:id` — teacher (own items) or admin (any). Update title,
  description, hidden flag.
- `DELETE /api/library/:id` — teacher (own items) or admin (any). Return 204.

For file uploads: if the platform has a file upload mechanism (Cloudinary, S3, etc.),
wire the library item creation to that upload flow. If not, the frontend can POST a URL
directly (for externally hosted files). Either way, `file_url` is what gets stored.

Student portal UI: a Library section that shows a card grid of available items. Each card
shows title, description, file type icon, and an open/download button. Filter by type
(audio / video / image / document). Items marked `hidden` are invisible to students.

Teacher/Admin UI: same view but includes an upload button, edit (title/description/hidden),
and delete controls. Hidden items appear with a "hidden" badge.

---

### 7. Platform settings

A single-row config table that lets admin toggle feature flags and provider settings
without redeploying.

**Schema**: `platform_settings` table with `id integer PRIMARY KEY NOT NULL`,
`updated_at timestamp DEFAULT now()`. Add whatever settings are relevant for the SAT
platform (e.g. `ai_provider varchar(20) DEFAULT 'claude'`, `maintenance_mode boolean DEFAULT false`).

The row is always row `id = 1` (singleton pattern). Use upsert on first read to ensure
it exists:

```typescript
// getPlatformSettings service
const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
if (row) return row;
const [created] = await db.insert(platformSettings).values({ id: 1 }).returning();
return created;
```

Routes:
- `GET /api/superadmin/platform-settings` — admin only, returns current settings.
- `PUT /api/superadmin/platform-settings` — admin only. Partial update with Zod validation.

Also expose `GET /api/platform-settings` as a **public** (no auth) route for settings
the frontend needs before login (e.g. maintenance mode banner, feature flags).

---

## Database patterns — apply these throughout

#### FK dependency order matters

When deleting and re-inserting rows, always delete in reverse FK order (children before
parents) and insert in forward FK order (parents before children). Violating this causes
FK constraint errors.

#### Chunk inserts

Never insert a large array in a single query — PostgreSQL has a 65535-parameter limit.
Split into chunks of 50 rows:

```typescript
const CHUNK = 50;
for (let i = 0; i < rows.length; i += CHUNK) {
  await tx.insert(table).values(rows.slice(i, i + CHUNK));
}
```

#### Date revival on restore

JSON serialisation turns `Date` objects into ISO strings. Drizzle's pg driver calls
`.toISOString()` on timestamp columns and throws if the value is already a string.
Run `reviveDates` (see Database tab section above) on every row array before inserting
during a restore.

#### Returning clauses

Use `.returning()` on inserts to get the created row back in the same query. Always
destructure: `const [row] = await db.insert(...).returning()`.

#### Drizzle migration commands

```bash
npm run db:generate  # generate migration files from schema changes
npm run db:migrate   # apply pending migrations
```

Run `db:generate` after every schema change. Commit the generated migration files.

---

## Code conventions — follow these throughout

- **Every async route handler** must wrap its body in `try { ... } catch (err) { next(err); }`.
  Express 4 does not forward async errors automatically.
- **Response shape**: always use the `ok()`, `created()`, `noContent()` helpers. Never
  call `res.json()` directly.
- **Error throwing**: always throw `AppError.badRequest(...)`, `AppError.notFound(...)`,
  etc. — never `res.status(400).json(...)` inline.
- **Zod validation**: call `schema.parse(req.body)` at the top of every route that
  accepts a body. The thrown `ZodError` is handled by the global error handler.
- **No comments explaining what the code does** — only add a comment when there is a
  non-obvious constraint, workaround, or subtle invariant.
- **No half-implemented stubs** — if a feature is implemented, implement it fully. If a
  route returns fake data, replace it.
- **Frontend TanStack Query**: wrap every API call in a `useQuery` or `useMutation`.
  Use `queryClient.invalidateQueries(...)` after mutations to keep the cache fresh. Do
  not manage server state in Zustand — Zustand is for client-only state (current user,
  UI state).
- **Frontend error handling**: read the error response's `error.message` field for
  user-facing messages. The backend always returns `{ success: false, error: { code, message } }`.

---

## Implementation order (recommended)

1. Verify / patch the middleware stack (`errorHandler`, `authenticate`, `requireRole`,
   `response helpers`, `AppError`) — everything else depends on these.
2. Verify / patch the auth system nuances (access code lookup, timing-safe login, token
   rotation race condition, cookie settings).
3. Verify / patch rate limiting and security middleware (helmet, CORS, trust proxy).
4. Super Admin: users tab → access codes tab → assignments tab.
5. Student platform feedback system (backend routes + student modal + admin tab).
6. Teacher → student feedback routes and student display.
7. Digital library (backend + UI for both student and teacher/admin views).
8. Platform settings (backend singleton + admin UI).
9. Backup / restore completeness (verify all relevant tables are included).
10. End-to-end smoke test of each flow.
