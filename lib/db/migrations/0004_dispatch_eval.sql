-- Eval columns on dispatch_archive. Populated by the dispatch-eval module
-- (regex sweep + LLM rubric pass) after each archived send so the operator
-- can trend dispatch quality over time and catch regressions when a prompt
-- change makes things worse.
--
-- Self-healing: ensureDispatchArchiveSchema in artifacts/api-server also
-- adds these columns idempotently on boot, so a fresh DB picks them up
-- regardless of whether this migration has run.

ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_scores JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_composite_score NUMERIC(4, 2);
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases_count INTEGER;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_model TEXT;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_run_at TIMESTAMPTZ;
