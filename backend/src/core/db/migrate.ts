import { pool } from './index';

const CREATE_ENUMS = `
  DO $$ BEGIN
    CREATE TYPE role AS ENUM ('student', 'teacher', 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE subject AS ENUM ('english', 'math');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE exam_type AS ENUM ('individual', 'mock_english', 'mock_math');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE exam_status AS ENUM ('in_progress', 'completed', 'abandoned');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE mock_status AS ENUM ('in_progress', 'completed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE answer_choice AS ENUM ('a', 'b', 'c', 'd');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE question_type AS ENUM ('multiple_choice', 'student_produced_response');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE sub_skill AS ENUM ('grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE sub_skill_source AS ENUM ('ai_suggested', 'human_confirmed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE question_difficulty AS ENUM ('easy', 'medium', 'hard');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE feedback_type AS ENUM ('reasoning_checkpoint', 'grammar_diagnosis', 'trap_explainer', 'command_of_evidence', 'transitions_coach', 'vocab_drill');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE content_type AS ENUM ('vocab_quiz', 'skill_passage');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE quality_flag AS ENUM ('pending', 'approved', 'rejected');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE narrative_status AS ENUM ('pending', 'complete', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE chat_role AS ENUM ('user', 'assistant');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE feedback_category AS ENUM ('bug', 'suggestion', 'other');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE file_type AS ENUM ('audio', 'video', 'image', 'document', 'other');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role role NOT NULL DEFAULT 'student',
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    role role NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS question_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subject subject NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    generated BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT '',
    passage_text TEXT NOT NULL,
    generated BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    passage_id UUID REFERENCES passages(id) ON DELETE SET NULL,
    question_type question_type NOT NULL DEFAULT 'multiple_choice',
    question_text TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_answer answer_choice,
    correct_answer_text TEXT,
    explanation TEXT,
    sub_skill sub_skill,
    sub_skill_source sub_skill_source,
    generated BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    type exam_type NOT NULL,
    status exam_status NOT NULL DEFAULT 'in_progress',
    score INTEGER,
    total_questions INTEGER NOT NULL DEFAULT 0,
    time_spent_seconds INTEGER,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS exam_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_answer answer_choice,
    selected_answer_text TEXT,
    is_correct BOOLEAN,
    answered_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mock_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    english_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    math_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    status mock_status NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_answer_id UUID NOT NULL REFERENCES exam_answers(id) ON DELETE CASCADE,
    feedback_type feedback_type NOT NULL,
    content JSONB NOT NULL,
    model_used TEXT NOT NULL,
    latency_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    cost_usd NUMERIC,
    parse_failed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS student_vocab (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    passage_excerpt TEXT NOT NULL,
    next_review_at TIMESTAMP NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease_factor NUMERIC NOT NULL DEFAULT 2.5,
    review_count INTEGER NOT NULL DEFAULT 0,
    last_correct BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS generated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type content_type NOT NULL DEFAULT 'vocab_quiz',
    source_question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content JSONB NOT NULL,
    quality_flag quality_flag NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    live_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS student_skill_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sub_skill TEXT NOT NULL,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, sub_skill)
  );

  CREATE TABLE IF NOT EXISTS mock_narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
    content JSONB,
    model_used TEXT NOT NULL DEFAULT '',
    latency_ms INTEGER,
    cost_usd NUMERIC,
    status narrative_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role chat_role NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS platform_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category feedback_category NOT NULL DEFAULT 'other',
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS library_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_type file_type NOT NULL,
    mime_type VARCHAR(100),
    file_name VARCHAR(300),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

// Idempotent ALTER TABLE statements for columns added after the initial deploy.
// ADD COLUMN IF NOT EXISTS and DROP NOT NULL are both safe to re-run.
const SCHEMA_UPDATES = `
  ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS selected_answer_text TEXT;

  ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage_id UUID REFERENCES passages(id) ON DELETE SET NULL;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type question_type NOT NULL DEFAULT 'multiple_choice';
  ALTER TABLE questions ALTER COLUMN option_a DROP NOT NULL;
  ALTER TABLE questions ALTER COLUMN option_b DROP NOT NULL;
  ALTER TABLE questions ALTER COLUMN option_c DROP NOT NULL;
  ALTER TABLE questions ALTER COLUMN option_d DROP NOT NULL;
  ALTER TABLE questions ALTER COLUMN correct_answer DROP NOT NULL;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer_text TEXT;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_skill sub_skill;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_skill_source sub_skill_source;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE passages ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
  ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS live_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL;

  DO $$ BEGIN
    ALTER TYPE file_type ADD VALUE IF NOT EXISTS 'note';
  EXCEPTION WHEN others THEN NULL; END $$;

  ALTER TABLE library_items ALTER COLUMN file_url DROP NOT NULL;
  ALTER TABLE library_items DROP COLUMN IF EXISTS mime_type;
  ALTER TABLE library_items ADD COLUMN IF NOT EXISTS note_content TEXT;

  ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('low', 'medium', 'hard'));

  ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

  CREATE TABLE IF NOT EXISTS teacher_vocab_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    definition TEXT NOT NULL,
    example_sentence TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS student_teacher_vocab_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_vocab_word_id UUID NOT NULL REFERENCES teacher_vocab_words(id) ON DELETE CASCADE,
    next_review_at TIMESTAMP NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease_factor NUMERIC NOT NULL DEFAULT 2.5,
    review_count INTEGER NOT NULL DEFAULT 0,
    last_correct BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, teacher_vocab_word_id)
  );

  ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS is_live_exam BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;

  CREATE TABLE IF NOT EXISTS live_exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    join_code VARCHAR(10) NOT NULL UNIQUE,
    english_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL,
    math_set_id UUID REFERENCES question_sets(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    started_at TIMESTAMP,
    english_duration_seconds INTEGER NOT NULL DEFAULT 3840,
    math_duration_seconds INTEGER NOT NULL DEFAULT 4200,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS live_exam_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES live_exam_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    english_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    math_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    global_feedback TEXT,
    result_released BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS live_exam_question_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES live_exam_participants(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    feedback TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(participant_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS english_m2_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL;
  ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS math_m2_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL;

  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/**
 * Phase 2 foundation.
 *
 * Ordering inside this block matters: every statement runs in the same
 * transaction as the rest of the migration, so a table has to exist before
 * anything references it. Organizations before `users.organization_id`, skills
 * before `questions.skill_code`.
 *
 * Every statement is idempotent — this runs on every server boot.
 */
const PHASE2_FOUNDATION = `
  -- Multi-tenancy insurance. One organization, every user in it, nothing scoped
  -- by it yet. Carrying the column from now on makes the real migration additive.
  CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

  -- The SAT domain/skill tree. A domain has no parent; a skill is a child of one.
  CREATE TABLE IF NOT EXISTS skills (
    code VARCHAR(64) PRIMARY KEY,
    label TEXT NOT NULL,
    subject subject NOT NULL,
    parent_code VARCHAR(64) REFERENCES skills(code) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Supersedes the five-value, Reading-&-Writing-only \`sub_skill\` enum, which
  -- left every Math question untaggable. \`sub_skill\` stays for now because the
  -- AI orchestrator still reads it; it is backfilled into this column below.
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS skill_code VARCHAR(64) REFERENCES skills(code) ON DELETE SET NULL;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty question_difficulty;

  -- Scaled SAT scores. Until now the only score in the database was a raw count
  -- of correct answers, and the 200-800 number was computed in the browser.
  ALTER TABLE exams ADD COLUMN IF NOT EXISTS scaled_score INTEGER;
  ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS rw_score INTEGER;
  ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS math_score INTEGER;
  ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS total_score INTEGER;

  CREATE TABLE IF NOT EXISTS student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    target_score INTEGER,
    test_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  -- One row per (student, question): a worklist, not a log.
  CREATE TABLE IF NOT EXISTS mistakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    exam_answer_id UUID REFERENCES exam_answers(id) ON DELETE SET NULL,
    miss_count INTEGER NOT NULL DEFAULT 1,
    first_missed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_missed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP,
    CONSTRAINT mistakes_student_question_unique UNIQUE (student_id, question_id)
  );

  CREATE INDEX IF NOT EXISTS mistakes_student_unresolved_idx
    ON mistakes (student_id) WHERE resolved_at IS NULL;
  CREATE INDEX IF NOT EXISTS questions_skill_code_idx ON questions (skill_code);

  -- An exam assembled by topic draws from many sets and belongs to none, so the
  -- set reference stops being mandatory. The answer sheet is what defines an
  -- exam's questions; order_index makes it fully self-describing.
  ALTER TABLE exams ALTER COLUMN set_id DROP NOT NULL;
  ALTER TABLE exam_answers ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
`;

/**
 * Seeds the eight official SAT domains, then re-parents the five legacy
 * `sub_skill` values underneath the domain each belongs to, so existing tagged
 * questions keep their meaning instead of being orphaned by the change.
 */
const SEED_SAT_TAXONOMY = `
  INSERT INTO skills (code, label, subject, parent_code, sort_order) VALUES
    ('algebra',                       'Algebra',                            'math',    NULL, 1),
    ('advanced_math',                 'Advanced Math',                      'math',    NULL, 2),
    ('problem_solving_data_analysis', 'Problem-Solving and Data Analysis',  'math',    NULL, 3),
    ('geometry_trigonometry',         'Geometry and Trigonometry',          'math',    NULL, 4),
    ('information_and_ideas',         'Information and Ideas',              'english', NULL, 1),
    ('craft_and_structure',           'Craft and Structure',                'english', NULL, 2),
    ('expression_of_ideas',           'Expression of Ideas',                'english', NULL, 3),
    ('standard_english_conventions',  'Standard English Conventions',       'english', NULL, 4)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO skills (code, label, subject, parent_code, sort_order) VALUES
    ('inference',           'Inference',              'english', 'information_and_ideas',        1),
    ('command_of_evidence', 'Command of Evidence',    'english', 'information_and_ideas',        2),
    ('vocab_in_context',    'Words in Context',       'english', 'craft_and_structure',          1),
    ('transitions',         'Transitions',            'english', 'expression_of_ideas',          1),
    ('grammar',             'Grammar and Usage',      'english', 'standard_english_conventions', 1)
  ON CONFLICT (code) DO NOTHING;
`;

/**
 * Backfills. Both are one-shot in effect but safe to re-run: each is guarded by
 * an IS NULL check, so a boot after the first is a no-op.
 */
const BACKFILL_FOUNDATION = `
  INSERT INTO organizations (name, slug)
  SELECT 'Default Organization', 'default'
  WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'default');

  UPDATE users SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
  WHERE organization_id IS NULL;

  UPDATE questions SET skill_code = sub_skill::TEXT
  WHERE skill_code IS NULL AND sub_skill IS NOT NULL;

  -- Existing answer sheets all default to 0; restore their real order from the
  -- question rows they point at, so pre-existing exams keep rendering in order.
  UPDATE exam_answers ea
  SET order_index = q.order_index
  FROM questions q
  WHERE q.id = ea.question_id AND ea.order_index = 0 AND q.order_index <> 0;
`;

/**
 * M0 foundation: the columns the rest of this wave writes to.
 *
 * Gathered into one block so that feature work never has to touch this file
 * again — the milestones that follow (scaled scoring, topic practice, the
 * mistake bank, the server timer, question versioning, the audit log) all write
 * to columns created here. Nothing reads them yet; that is deliberate.
 */
const M0_FOUNDATION = `
  -- Display name for an exam with no owning set: "Topic: Algebra",
  -- "Mistake review". Set-backed exams leave it null and show the set title.
  ALTER TABLE exams ADD COLUMN IF NOT EXISTS label TEXT;

  -- Server-authoritative timing. The limit is fixed at creation; the deadline is
  -- stamped on first open, because a mock's Math Module 1 is created when the
  -- mock starts but may be sat much later.
  ALTER TABLE exams ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER;
  ALTER TABLE exams ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMP;

  -- Copy-on-write question versioning. Editing a question that a completed exam
  -- references retires it and inserts a replacement, so past attempts keep
  -- meaning what they meant. Assemblers filter retired_at IS NULL.
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP;
  ALTER TABLE questions ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES questions(id) ON DELETE SET NULL;

  -- Soft delete for sets with attempt history: deleting one cascades through
  -- exams -> exam_answers -> ai_feedback and destroys graded results.
  ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

  -- Who did the irreversible thing. actor_id is SET NULL rather than CASCADE:
  -- deleting a user must not delete the record of what they did.
  CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    payload JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
`;

const SEED_DEFAULT_ADMIN_CODE = `
  INSERT INTO access_codes (code, role, description, is_active)
  SELECT '000000', 'admin', 'Default admin access code', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM access_codes WHERE role = 'admin');
`;

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_ENUMS);
    await client.query(CREATE_TABLES);
    await client.query(SCHEMA_UPDATES);
    await client.query(PHASE2_FOUNDATION);
    await client.query(M0_FOUNDATION);
    await client.query(SEED_SAT_TAXONOMY);
    await client.query(BACKFILL_FOUNDATION);
    await client.query(SEED_DEFAULT_ADMIN_CODE);
    await client.query('COMMIT');
    console.log('Migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
