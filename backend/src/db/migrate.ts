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
