-- Three-track eval restructure on dispatch_archive. The original eval
-- columns score the prose only; this adds two parallel tracks:
--
--   * formatting — deterministic HTML/structure issues (fixed by template
--     edits, not by fine-tuning).
--   * banner — image rubric scored by a vision model in PR B (separate
--     model target, kept out of the writing composite).
--
-- Self-healing: ensureDispatchEvalSchema in artifacts/api-server adds
-- these columns idempotently on boot, so a fresh DB picks them up
-- regardless of whether this migration has run.

ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_formatting JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_formatting_score NUMERIC(4, 2);
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_scores JSONB;
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_composite_score NUMERIC(4, 2);
ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_model TEXT;
