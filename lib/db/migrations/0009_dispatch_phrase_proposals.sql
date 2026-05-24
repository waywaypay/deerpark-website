-- @no-transaction
-- Auto-mined banned-phrase candidates surfaced by dispatch-phrase-mining.
-- The eval's worstItems quotes feed an n-gram extractor; phrases that
-- recur across multiple dispatches land in this table and the runtime
-- gates merge active rows with the static BANNED_PATTERNS code list.
--
-- Severity is monotonic — promotions to "violation" are sticky so a
-- gate-blocked phrase doesn't drift back to "warning" when its
-- worst-items frequency drops. Operator can dismiss false positives via
-- dismissed_at; dismissed rows are ignored by the runtime gate.
--
-- Self-healing: artifacts/api-server's dispatch-phrase-mining module
-- mirrors this with ensureDispatchPhraseProposalsSchema() on boot.
--
-- Runs outside a transaction so the CREATE INDEX statements can use
-- CONCURRENTLY. The miner upserts into this table on every eval, so
-- once it's populated we want index builds to avoid the
-- ShareLock/ShareUpdateExclusive contention a non-concurrent build
-- would inflict on the upsert path. On the first run (empty table)
-- the difference is academic; CONCURRENTLY is essentially free.

CREATE TABLE IF NOT EXISTS dispatch_phrase_proposals (
  phrase             TEXT PRIMARY KEY,
  regex_source       TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'warning',
  hit_count          INTEGER NOT NULL DEFAULT 0,
  hit_dispatch_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample             TEXT,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at        TIMESTAMPTZ,
  dismissed_at       TIMESTAMPTZ
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_phrase_proposals_severity_idx
  ON dispatch_phrase_proposals (severity, dismissed_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_phrase_proposals_last_seen_idx
  ON dispatch_phrase_proposals (last_seen_at);
