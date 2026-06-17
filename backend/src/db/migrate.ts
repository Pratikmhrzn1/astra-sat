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

  CREATE TABLE IF NOT EXISTS question_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subject subject NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer answer_choice NOT NULL,
    explanation TEXT,
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
