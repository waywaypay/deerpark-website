-- Per-call LLM trace for dispatch composes. Every polish + fallback
-- request inside composeDailyEmail writes one row. This is what makes
-- the dataset SFT-extractable: `(prompt_hash → dispatch_prompts.content,
-- user_message)` is the input, `response_text` is the raw output before
-- JSON parse, and the row joins to dispatch_archive for eval signals.
--
-- Self-healing: artifacts/api-server's dispatch-llm-calls module also
-- creates this idempotently on boot.

CREATE TABLE IF NOT EXISTS dispatch_llm_calls (
  id SERIAL PRIMARY KEY,
  dispatch_archive_id INTEGER,
  kind TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  user_message TEXT NOT NULL,
  response_text TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_llm_calls_archive_id_idx
  ON dispatch_llm_calls (dispatch_archive_id);
CREATE INDEX IF NOT EXISTS dispatch_llm_calls_created_at_idx
  ON dispatch_llm_calls (created_at);
