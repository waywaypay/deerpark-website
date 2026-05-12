-- Archive of dispatch newsletter sends with operator feedback.
--
-- Every composed dispatch (real send or admin test send) writes one row here
-- so the operator can review past sends and capture freeform feedback against
-- each one. The feedback column accumulates a structured training dataset for
-- iterating on the dispatch prompt over time.
--
-- Self-healing: artifacts/api-server's daily-digest also creates this table
-- via CREATE TABLE IF NOT EXISTS on boot, so the table is present even if
-- this migration hasn't been picked up yet.

CREATE TABLE IF NOT EXISTS dispatch_archive (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  intro_html TEXT NOT NULL,
  body_html TEXT NOT NULL,
  headlines_snapshot JSONB NOT NULL,
  recipient_count INTEGER,
  polish_applied BOOLEAN NOT NULL DEFAULT FALSE,
  banner_generated BOOLEAN NOT NULL DEFAULT FALSE,
  feedback TEXT,
  feedback_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_archive_created_at_idx
  ON dispatch_archive (created_at);
