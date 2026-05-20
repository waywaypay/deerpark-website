-- Rubric v2 columns on dispatch_archive. Adds the structured fields the
-- multi-judge ensemble pipeline writes (judge roster, rubric version),
-- the pairwise-specificity comparison against the previous dispatch, and
-- the delayed engagement signal (unsubs in the 24h after send) that lets
-- the admin UI correlate eval scores with reader behavior.
--
-- All additive; nullable; safe on rows evaluated under the old single-judge
-- pipeline. Mirrored idempotently by ensureDispatchEvalSchema on every
-- boot so a fresh DB picks them up even before this migration runs.

ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_rubric_version TEXT;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_judge_models JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_pairwise JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_unsubs_24h INTEGER;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_unsub_rate_24h NUMERIC(6, 4);
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_engagement_run_at TIMESTAMPTZ;

-- Index the engagement-run timestamp so the hourly backfill tick can find
-- "needs engagement signal" rows cheaply (`WHERE eval_engagement_run_at IS
-- NULL AND created_at < now() - '24h'::interval`).
CREATE INDEX IF NOT EXISTS dispatch_archive_eval_engagement_run_at_idx
  ON dispatch_archive (eval_engagement_run_at);
