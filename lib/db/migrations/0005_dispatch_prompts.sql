-- Content-addressed registry of dispatch composition prompts. Every
-- archived dispatch records the hashes of the polish / fallback /
-- commentator / banner prompts that drove it, joining here for full
-- content. Lets the operator trend eval scores by prompt version and
-- diff any two versions side-by-side.
--
-- Self-healing: artifacts/api-server's dispatch-prompts module also
-- runs this idempotently on boot via ensureDispatchPromptsSchema().

CREATE TABLE IF NOT EXISTS dispatch_prompts (
  hash TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  note TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_prompts_slot_idx
  ON dispatch_prompts (slot, first_seen_at);

-- The archive row records the prompt versions that drove each
-- composition. JSON keyed by slot ({polish, fallback, commentator,
-- banner}) → hash. Idempotent ALTER, mirrored by the self-heal.
ALTER TABLE dispatch_archive
  ADD COLUMN IF NOT EXISTS prompt_versions JSONB;
