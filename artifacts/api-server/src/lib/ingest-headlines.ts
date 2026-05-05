import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { db, headlinesTable, type InsertHeadline } from "@workspace/db";
import { sql } from "drizzle-orm";
import { SOURCES, type SourceConfig } from "./headline-sources";
import { logger } from "./logger";

type NormalizedItem = Omit<InsertHeadline, "id" | "createdAt" | "relevanceScore">;

const USER_AGENT =
  "Mozilla/5.0 (compatible; DeerPark-Headlines/1.0; +https://deerpark.io)";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": USER_AGENT },
});

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

/** True for Seeking Alpha–style earnings materials we treat as “transcript” rows. */
function isTranscriptStyleTitle(title: string): boolean {
  const t = title.toLowerCase();
  if (t.includes("earnings call transcript") || t.includes("prepared remarks transcript")) return true;
  if (/\bshareholder\/analyst call transcript\b/i.test(title)) return true;
  if (t.includes("transcript")) {
    return (
      /\bearnings\b|\bresults\b|\bcall\b|conference|investor|analyst\b/i.test(title) ||
      /\([A-Z]{1,5}(?::[A-Z]+)?\)/.test(title)
    );
  }
  return false;
}

// Semis, hyperscalers & software names where AI materially moves the needle (ticker + select names).
const EARNINGS_AI_TICKER_OR_CO =
  /\((?:NVDA|MSFT|META|GOOGL|GOOG|AMZN|AAPL|AMD|INTC|AVGO|CRM|NOW|SNOW|PLTR|CRWD|MRVL|PANW|ZS|NET|ADBE|IBM|ORCL|QCOM|TSM|ASML|ARM|INTU|ADSK|SHOP|SPOT|U|DDOG|DOCN|ESTC|CFLT|SNPS|CDNS|ANET)\)/i;

const EARNINGS_AI_NAMES =
  /\b(NVIDIA|Microsoft|Alphabet|Meta Platforms|Amazon\.com|Apple|Intel|Advanced Micro Devices|Broadcom|Palantir|Snowflake|Salesforce|ServiceNow|Adobe|Oracle|IBM|Qualcomm|TSMC|ASML|Arm Holdings|Autodesk|Datadog|Elastic|Confluent|Synopsys|Cadence|Arista)\b/i;

const EARNINGS_AI_TOPICS =
  /\b(artificial intelligence|machine learning|\bai\b|\bgpu\b|data\s*center|hyperscaler|llm|openai|anthropic|gemini|copilot|azure\s+ai|aws\s+ai|foundry|inference|accelerator|CUDA|H100|H200|Blackwell|Rubin)\b/i;

function shouldIncludeEarningsTranscript(title: string): boolean {
  if (!isTranscriptStyleTitle(title)) return false;
  if (EARNINGS_AI_TICKER_OR_CO.test(title)) return true;
  if (EARNINGS_AI_NAMES.test(title)) return true;
  if (EARNINGS_AI_TOPICS.test(title)) return true;
  return false;
}

async function fetchEarningsTranscripts(source: SourceConfig): Promise<NormalizedItem[]> {
  const feed = await parser.parseURL(source.url);
  return (feed.items ?? [])
    .filter((item) => item.link && item.title && shouldIncludeEarningsTranscript(item.title!))
    .map((item) => ({
      source: source.displayName,
      category: source.category,
      title: item.title!.trim(),
      url: item.link!,
      urlHash: hashUrl(item.link!),
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
    }));
}

async function fetchRss(source: SourceConfig): Promise<NormalizedItem[]> {
  const feed = await parser.parseURL(source.url);
  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .filter((item) => !source.aiFilter || isAiRelevant(item.title!))
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

async function fetchAnthropicNews(source: SourceConfig): Promise<NormalizedItem[]> {
  const res = await fetch(source.url, {
    headers: { accept: "text/html", "user-agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}`);
  const html = await res.text();

  const cardRe = /<a href="(\/news\/[a-z0-9-]+)"[^>]*class="[^"]*PublicationList-module[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const dateRe = /^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+\S+\s+(.+)$/;
  const seen = new Set<string>();
  const items: NormalizedItem[] = [];

  for (const match of html.matchAll(cardRe)) {
    const slug = match[1]!;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const inner = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const decoded = inner
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "’")
      .replace(/&#8216;/g, "‘");

    const parsed = decoded.match(dateRe);
    let title = decoded;
    let publishedAt = new Date();
    if (parsed) {
      const [, month, day, year, t] = parsed;
      title = t!.trim();
      const candidate = new Date(`${month} ${day}, ${year}`);
      if (!Number.isNaN(candidate.getTime())) publishedAt = candidate;
    }
    if (!title) continue;

    const url = `https://www.anthropic.com${slug}`;
    items.push({
      source: source.displayName,
      category: source.category,
      title,
      url,
      urlHash: hashUrl(url),
      publishedAt,
    });
  }

  return items;
}

async function fetchMistralNews(source: SourceConfig): Promise<NormalizedItem[]> {
  // Mistral's /news page is JS-rendered, but their sitemap.xml lists every
  // news URL with a lastmod date. Each article page is server-rendered with
  // og:title metadata, so we fetch the sitemap, take recent /news/ entries,
  // then fetch each article for its title.
  const sitemapRes = await fetch(source.url, {
    headers: { accept: "application/xml", "user-agent": USER_AGENT },
  });
  if (!sitemapRes.ok) throw new Error(`Mistral sitemap returned ${sitemapRes.status}`);
  const sitemapXml = await sitemapRes.text();

  const urlBlockRe =
    /<url>\s*<loc>(https:\/\/mistral\.ai\/news\/[a-z0-9-]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g;
  const candidates: { url: string; lastmod: Date }[] = [];
  for (const match of sitemapXml.matchAll(urlBlockRe)) {
    const lastmod = new Date(match[2]!);
    if (Number.isNaN(lastmod.getTime())) continue;
    candidates.push({ url: match[1]!, lastmod });
  }
  candidates.sort((a, b) => b.lastmod.getTime() - a.lastmod.getTime());
  const recent = candidates.slice(0, 15);

  const ogTitleRe = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
  const titleTagRe = /<title>([^<]+)<\/title>/i;

  const items = await Promise.all(
    recent.map(async ({ url, lastmod }): Promise<NormalizedItem | null> => {
      try {
        const res = await fetch(url, {
          headers: { accept: "text/html", "user-agent": USER_AGENT },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const raw = (html.match(ogTitleRe)?.[1] ?? html.match(titleTagRe)?.[1] ?? "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        // Strip "| Mistral AI" suffix that Mistral appends to every page title.
        const title = raw.replace(/\s*\|\s*Mistral AI\s*$/, "").trim();
        if (!title) return null;
        return {
          source: source.displayName,
          category: source.category,
          title,
          url,
          urlHash: hashUrl(url),
          publishedAt: lastmod,
        };
      } catch {
        return null;
      }
    }),
  );

  return items.filter((i): i is NormalizedItem => i !== null);
}

async function fetchEpochBlog(source: SourceConfig): Promise<NormalizedItem[]> {
  // Epoch AI's blog index is server-rendered HTML. Each card has the title in
  // an <img alt=...> attribute, the date in a <span class="badge-text">, and
  // the slug in an <a class="cover-link"> — in that order, all within ~3KB.
  const res = await fetch(source.url, {
    headers: { accept: "text/html", "user-agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Epoch returned ${res.status}`);
  const html = await res.text();

  const cardRe =
    /<img\s+src="[^"]*"\s+alt="([^"]+)"\s+class="card-img"[^>]*\/>[\s\S]{0,3000}?<span class="badge-text">([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})<\/span>[\s\S]{0,800}?<a\s+href="(\/blog\/[a-z0-9-]+)"\s+class="cover-link">/g;

  const seen = new Set<string>();
  const items: NormalizedItem[] = [];
  for (const match of html.matchAll(cardRe)) {
    const title = match[1]!.trim();
    const dateRaw = match[2]!.replace(/\./g, "");
    const slug = match[3]!;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const parsed = new Date(dateRaw);
    const publishedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const url = `https://epoch.ai${slug}`;
    items.push({
      source: source.displayName,
      category: source.category,
      title,
      url,
      urlHash: hashUrl(url),
      publishedAt,
    });
  }
  return items;
}

async function fetchDeepSeekNews(source: SourceConfig): Promise<NormalizedItem[]> {
  // DeepSeek's news pages live at api-docs.deepseek.com/news/news<DATE>.
  // Their sitemap.xml lists every entry, but without lastmod — date is encoded
  // in the slug. Old entries use 4-digit MMDD (assume 2024), modern entries
  // use 6-digit YYMMDD. We fetch each recent page for its <h1> title.
  const sitemapRes = await fetch(source.url, {
    headers: { accept: "application/xml", "user-agent": USER_AGENT },
  });
  if (!sitemapRes.ok) throw new Error(`DeepSeek sitemap returned ${sitemapRes.status}`);
  const xml = await sitemapRes.text();

  const slugRe = /<loc>(https:\/\/api-docs\.deepseek\.com\/news\/news(\d+))<\/loc>/g;
  const candidates: { url: string; publishedAt: Date }[] = [];
  for (const match of xml.matchAll(slugRe)) {
    const url = match[1]!;
    const digits = match[2]!;
    let publishedAt: Date;
    if (digits.length === 6) {
      const yy = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      const dd = Number(digits.slice(4, 6));
      publishedAt = new Date(Date.UTC(2000 + yy, mm - 1, dd));
    } else if (digits.length === 4) {
      const mm = Number(digits.slice(0, 2));
      const dd = Number(digits.slice(2, 4));
      publishedAt = new Date(Date.UTC(2024, mm - 1, dd));
    } else {
      continue;
    }
    if (Number.isNaN(publishedAt.getTime())) continue;
    candidates.push({ url, publishedAt });
  }
  candidates.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const recent = candidates.slice(0, 10);

  const h1Re = /<h1[^>]*>([^<]+)<\/h1>/i;
  const items = await Promise.all(
    recent.map(async ({ url, publishedAt }): Promise<NormalizedItem | null> => {
      try {
        const res = await fetch(url, {
          headers: { accept: "text/html", "user-agent": USER_AGENT },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const title = (html.match(h1Re)?.[1] ?? "").trim();
        if (!title) return null;
        return {
          source: source.displayName,
          category: source.category,
          title,
          url,
          urlHash: hashUrl(url),
          publishedAt,
        };
      } catch {
        return null;
      }
    }),
  );
  return items.filter((i): i is NormalizedItem => i !== null);
}

async function fetchKimiBlog(source: SourceConfig): Promise<NormalizedItem[]> {
  // Kimi's blog index is server-rendered with one anchor per post containing
  // h4.card-title and p.card-date (YYYY/MM/DD). The page lists each post
  // twice (hero + grid) — dedupe on slug.
  const res = await fetch(source.url, {
    headers: { accept: "text/html", "user-agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Kimi blog returned ${res.status}`);
  const html = await res.text();

  const cardRe =
    /<a\s+href="(\/blog\/[a-z0-9-]+)"[^>]*>[\s\S]*?<h4[^>]*class="card-title"[^>]*>([^<]+)<\/h4>[\s\S]*?<p[^>]*class="card-date"[^>]*>([^<]+)<\/p>[\s\S]*?<\/a>/g;
  const seen = new Set<string>();
  const items: NormalizedItem[] = [];

  for (const match of html.matchAll(cardRe)) {
    const slug = match[1]!;
    if (seen.has(slug)) continue;
    seen.add(slug);

    const title = match[2]!.trim();
    const dateRaw = match[3]!.trim();
    const dateMatch = dateRaw.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
    let publishedAt = new Date();
    if (dateMatch) {
      const candidate = new Date(
        Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])),
      );
      if (!Number.isNaN(candidate.getTime())) publishedAt = candidate;
    }

    const url = `https://www.kimi.com${slug}`;
    items.push({
      source: source.displayName,
      category: source.category,
      title,
      url,
      urlHash: hashUrl(url),
      publishedAt,
    });
  }
  return items;
}

async function fetchSource(source: SourceConfig): Promise<NormalizedItem[]> {
  switch (source.kind) {
    case "rss":
      return fetchRss(source);
    case "hn":
      return fetchHackerNews(source);
    case "hf-papers":
      return fetchHfPapers(source);
    case "anthropic-news":
      return fetchAnthropicNews(source);
    case "mistral-news":
      return fetchMistralNews(source);
    case "epoch-blog":
      return fetchEpochBlog(source);
    case "deepseek-news":
      return fetchDeepSeekNews(source);
    case "kimi-blog":
      return fetchKimiBlog(source);
    case "earnings-transcripts":
      return fetchEarningsTranscripts(source);
  }
}

export type IngestResult = {
  source: string;
  fetched: number;
  inserted: number;
  error?: string;
};

async function ingestOne(source: SourceConfig): Promise<IngestResult> {
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
}

export async function ingestSourceById(id: string): Promise<IngestResult | null> {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) return null;
  return ingestOne(source);
}

export async function ingestAllSources(): Promise<IngestResult[]> {
  const enabled = SOURCES.filter((s) => s.enabled);
  logger.info({ count: enabled.length }, "Starting headline ingestion");

  const results = await Promise.all(enabled.map(ingestOne));

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
