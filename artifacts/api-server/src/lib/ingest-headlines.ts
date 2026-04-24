import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { db, headlinesTable, type InsertHeadline } from "@workspace/db";
import { sql } from "drizzle-orm";
import { SOURCES, type SourceConfig } from "./headline-sources";
import { logger } from "./logger";

type NormalizedItem = Omit<InsertHeadline, "id" | "createdAt" | "relevanceScore">;

const parser = new Parser({ timeout: 15_000 });

const hashUrl = (url: string) => createHash("sha1").update(url).digest("hex");

const AI_KEYWORDS = [
  "ai", "ml", "llm", "gpt", "claude", "gemini", "llama", "anthropic",
  "openai", "agent", "rag", "embedding", "inference", "fine-tun",
  "model", "neural", "transformer", "huggingface",
];

const isAiRelevant = (title: string) => {
  const lower = title.toLowerCase();
  return AI_KEYWORDS.some((kw) => lower.includes(kw));
};

async function fetchRss(source: SourceConfig): Promise<NormalizedItem[]> {
  const feed = await parser.parseURL(source.url);
  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source: source.displayName,
      category: source.category,
      title: item.title!.trim(),
      url: item.link!,
      urlHash: hashUrl(item.link!),
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
    }));
}

async function fetchHackerNews(source: SourceConfig): Promise<NormalizedItem[]> {
  const res = await fetch(source.url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HN returned ${res.status}`);
  const data = (await res.json()) as {
    hits: Array<{ objectID: string; title: string | null; url: string | null; created_at: string; points: number }>;
  };
  return data.hits
    .filter((h) => h.title && h.url)
    .filter((h) => isAiRelevant(h.title!))
    .map((h) => ({
      source: source.displayName,
      category: source.category,
      title: h.title!,
      url: h.url!,
      urlHash: hashUrl(h.url!),
      publishedAt: new Date(h.created_at),
    }));
}

async function fetchHfPapers(source: SourceConfig): Promise<NormalizedItem[]> {
  const res = await fetch(source.url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HF returned ${res.status}`);
  const data = (await res.json()) as Array<{
    paper: { id: string; title: string; publishedAt?: string };
  }>;
  return data.map((entry) => {
    const url = `https://huggingface.co/papers/${entry.paper.id}`;
    return {
      source: source.displayName,
      category: source.category,
      title: entry.paper.title,
      url,
      urlHash: hashUrl(url),
      publishedAt: entry.paper.publishedAt ? new Date(entry.paper.publishedAt) : new Date(),
    };
  });
}

async function fetchSource(source: SourceConfig): Promise<NormalizedItem[]> {
  switch (source.kind) {
    case "rss":
      return fetchRss(source);
    case "hn":
      return fetchHackerNews(source);
    case "hf-papers":
      return fetchHfPapers(source);
  }
}

export type IngestResult = {
  source: string;
  fetched: number;
  inserted: number;
  error?: string;
};

export async function ingestAllSources(): Promise<IngestResult[]> {
  const enabled = SOURCES.filter((s) => s.enabled);
  logger.info({ count: enabled.length }, "Starting headline ingestion");

  const results = await Promise.all(
    enabled.map(async (source): Promise<IngestResult> => {
      try {
        const items = await fetchSource(source);
        if (items.length === 0) {
          return { source: source.displayName, fetched: 0, inserted: 0 };
        }
        const rows = await db
          .insert(headlinesTable)
          .values(items)
          .onConflictDoNothing({
            target: [headlinesTable.source, headlinesTable.urlHash],
          })
          .returning({ id: headlinesTable.id });
        return {
          source: source.displayName,
          fetched: items.length,
          inserted: rows.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ source: source.id, err: message }, "Source ingestion failed");
        return { source: source.displayName, fetched: 0, inserted: 0, error: message };
      }
    }),
  );

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  logger.info({ totalInserted, results }, "Headline ingestion complete");

  // Keep the table bounded — retain the most recent 500 per source.
  await db.execute(sql`
    DELETE FROM headlines h
    USING (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
        FROM headlines
      ) ranked WHERE rn > 500
    ) old
    WHERE h.id = old.id
  `);

  return results;
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startHeadlineScheduler(intervalMs = 15 * 60 * 1000): void {
  if (intervalHandle) return;
  // Kick off an initial run, then schedule.
  ingestAllSources().catch((err) => logger.error({ err }, "Initial ingest failed"));
  intervalHandle = setInterval(() => {
    ingestAllSources().catch((err) => logger.error({ err }, "Scheduled ingest failed"));
  }, intervalMs);
}
