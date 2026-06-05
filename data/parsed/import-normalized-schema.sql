-- Recommended normalized schema for imported question banks.
-- Run in Supabase SQL Editor before insert-normalized-questions.sql.

CREATE TABLE IF NOT EXISTS question_bank_sources (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'math-buddy-user',
  title TEXT NOT NULL,
  source TEXT,
  grade TEXT,
  subject TEXT DEFAULT '数学',
  curriculum TEXT,
  chapter TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'math-buddy-user',
  bank_source_id BIGINT REFERENCES question_bank_sources(id) ON DELETE SET NULL,
  external_id TEXT,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  assets JSONB NOT NULL DEFAULT '[]',
  answer_status TEXT NOT NULL DEFAULT 'needs_review',
  difficulty TEXT,
  grade TEXT,
  subject TEXT DEFAULT '数学',
  curriculum TEXT,
  chapter TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  source TEXT,
  raw JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_user_created ON questions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter);
CREATE INDEX IF NOT EXISTS idx_questions_answer_status ON questions(answer_status);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source);

ALTER TABLE question_bank_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_bank_sources_access" ON question_bank_sources;
DROP POLICY IF EXISTS "questions_access" ON questions;
CREATE POLICY "question_bank_sources_access" ON question_bank_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "questions_access" ON questions FOR ALL USING (true) WITH CHECK (true);
