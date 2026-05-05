-- Fix posts that hallucinated "Anthropologic" instead of the AI lab "Anthropic".
--
-- The model intermittently produces "Anthropologic" (a real English word
-- meaning 'relating to anthropology') when it means the company. The runtime
-- sanitizer in writer-agent prevents this for new posts; this migration
-- cleans up rows written before the sanitizer landed.
--
-- Negative lookahead `(?![a-z])` skips real adjectives like "Anthropological"
-- and "Anthropologically". `\m` is the Postgres start-of-word anchor.
-- Idempotent: re-running matches zero rows once the data is clean.

UPDATE posts
SET
  title         = regexp_replace(title,         '\mAnthropologic(?![a-z])', 'Anthropic', 'g'),
  dek           = regexp_replace(dek,           '\mAnthropologic(?![a-z])', 'Anthropic', 'g'),
  body_markdown = regexp_replace(body_markdown, '\mAnthropologic(?![a-z])', 'Anthropic', 'g')
WHERE title         LIKE '%Anthropologic%'
   OR dek           LIKE '%Anthropologic%'
   OR body_markdown LIKE '%Anthropologic%';
