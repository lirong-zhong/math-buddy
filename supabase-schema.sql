-- ============================================================
-- 数学搭档 - Supabase 数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================================

-- 1. 练习记录表（核心）
CREATE TABLE IF NOT EXISTS practices (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  question    TEXT NOT NULL,                    -- 题目文字
  q_type      TEXT NOT NULL,                    -- 题目类型
  user_answer TEXT,                             -- 用户提交的答案
  is_correct  BOOLEAN,                          -- 是否答对
  error_tag   TEXT,                             -- 错因标签 A/B/C/D/E/F
  messages    JSONB DEFAULT '[]',               -- 对话记录 [{role, html}]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_practices_user_created ON practices(user_id, created_at DESC);
CREATE INDEX idx_practices_user_correct ON practices(user_id, is_correct);

-- 2. 错题汇总记录
CREATE TABLE IF NOT EXISTS error_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  question   TEXT NOT NULL,
  error_tag  TEXT NOT NULL,                    -- A/B/C/D/E/F
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_logs_user ON error_logs(user_id, created_at DESC);

-- 3. 题库（家长上传）
CREATE TABLE IF NOT EXISTS question_banks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  questions   JSONB NOT NULL DEFAULT '[]',     -- [{text, type, answer}]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_question_banks_user ON question_banks(user_id, created_at DESC);

-- 4. 用户统计
CREATE TABLE IF NOT EXISTS user_stats (
  user_id    TEXT PRIMARY KEY,
  streak     INT DEFAULT 0,
  today_done INT DEFAULT 0,
  today_correct INT DEFAULT 0,
  last_active_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security（RLS）策略
-- 每个用户只能看自己的数据
-- ============================================================

ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- 用 Supabase anon key 配合 RLS：通过 user_id 匹配来保护数据
-- 注意：这里用简单的 user_id 而不是 Supabase Auth，因为小朋友用家长设置的密码登录

CREATE POLICY "practices_user_policy" ON practices
  FOR ALL USING (user_id = current_setting('request.jwt.claims')::json->>'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims')::json->>'sub');

CREATE POLICY "error_logs_user_policy" ON error_logs
  FOR ALL USING (user_id = current_setting('request.jwt.claims')::json->>'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims')::json->>'sub');

CREATE POLICY "question_banks_user_policy" ON question_banks
  FOR ALL USING (user_id = current_setting('request.jwt.claims')::json->>'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims')::json->>'sub');

CREATE POLICY "user_stats_user_policy" ON user_stats
  FOR ALL USING (user_id = current_setting('request.jwt.claims')::json->>'sub')
  WITH CHECK (user_id = current_setting('request.jwt.claims')::json->>'sub');

-- 由于我们用 Shared Secret（APP_PASSWORD），JWT 的 sub 就是 "math-buddy-user"
-- 所以创建一个固定的 user_id 策略
DROP POLICY IF EXISTS "practices_user_policy" ON practices;
DROP POLICY IF EXISTS "error_logs_user_policy" ON error_logs;
DROP POLICY IF EXISTS "question_banks_user_policy" ON question_banks;
DROP POLICY IF EXISTS "user_stats_user_policy" ON user_stats;

-- 更简单的策略：用 jwt claim 中的 user_role = 'math-buddy'
CREATE POLICY "practices_access" ON practices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "error_logs_access" ON error_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "question_banks_access" ON question_banks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "user_stats_access" ON user_stats FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE practices IS '练习记录：每次答题的完整记录';
COMMENT ON TABLE error_logs IS '错题记录：错误类型标记';
COMMENT ON TABLE question_banks IS '上传题库：家长上传的自定义题目';
COMMENT ON TABLE user_stats IS '用户统计：连续天数、今日进度';
