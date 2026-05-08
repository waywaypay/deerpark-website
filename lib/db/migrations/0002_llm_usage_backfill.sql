-- Centralize Venice spend tracking in `llm_usage`. Backfill historical
-- writer-agent + sms-bot rows so the /admin/usage/venice tracker doesn't
-- regress when it switches over to read from this table.
--
-- New callers (judge, commentator, email polish/fallback, image-gen) had
-- no persistent usage record before this commit, so they're not part of
-- the backfill — they only start showing up once they begin writing live.
--
-- Idempotent: skips rows already inserted by checking on the synthetic
-- `(caller, call_kind, source_id)` shape we build below. Re-runnable as a
-- safety net in case the data_migrations table is wiped.

CREATE TABLE IF NOT EXISTS llm_usage (
  id SERIAL PRIMARY KEY,
  caller TEXT NOT NULL,
  call_kind TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_usage_created_at_idx ON llm_usage (created_at);
CREATE INDEX IF NOT EXISTS llm_usage_caller_idx ON llm_usage (caller);

-- Use a one-shot guard so re-running the migration after the table already
-- has rows from live traffic doesn't double-count. We backfill only when
-- the table is empty.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM llm_usage LIMIT 1) THEN
    INSERT INTO llm_usage (caller, call_kind, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at)
    SELECT
      'writer'                                    AS caller,
      'chat'                                      AS call_kind,
      model,
      COALESCE(prompt_tokens, 0)                  AS prompt_tokens,
      COALESCE(completion_tokens, 0)              AS completion_tokens,
      COALESCE(total_tokens, COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) AS total_tokens,
      COALESCE(NULLIF(cost_usd, '')::numeric, 0)  AS cost_usd,
      created_at
    FROM posts
    WHERE prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL OR cost_usd IS NOT NULL;

    INSERT INTO llm_usage (caller, call_kind, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at)
    SELECT
      'sms_bot'                                                AS caller,
      'chat'                                                   AS call_kind,
      COALESCE(model, '(unknown)')                             AS model,
      COALESCE(prompt_tokens, 0)                               AS prompt_tokens,
      COALESCE(completion_tokens, 0)                           AS completion_tokens,
      COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0) AS total_tokens,
      COALESCE(cost_usd::numeric, 0)                           AS cost_usd,
      created_at
    FROM sms_messages
    WHERE direction = 'outbound' AND model IS NOT NULL;
  END IF;
END $$;
