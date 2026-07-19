-- Local migration: brings the local dev DB up to full schema parity
-- Safe to run multiple times (uses IF NOT EXISTS / DO $$ guards)

-- ── New enums ──────────────────────────────────────────────────────────────────
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
  CREATE TYPE file_type AS ENUM ('audio', 'video', 'image', 'document', 'other', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Columns missing from existing tables ──────────────────────────────────────

-- users.updated_at
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- users unique email constraint
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL; END $$;

-- question_sets.description / difficulty / generated / updated_at
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- questions: missing columns
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type question_type NOT NULL DEFAULT 'multiple_choice';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer_text TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_skill sub_skill;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sub_skill_source sub_skill_source;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

-- exams: time_spent_seconds
ALTER TABLE exams ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER;

-- access_codes: missing columns
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0;

-- ── New tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
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

-- Add passage_id FK to questions now that passages exists
ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage_id UUID REFERENCES passages(id) ON DELETE SET NULL;

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
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_skill_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_skill TEXT NOT NULL,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMP NOT NULL DEFAULT NOW()
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
  file_url TEXT,
  file_type file_type NOT NULL,
  file_name VARCHAR(300),
  note_content TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
