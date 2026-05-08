// Daily top-10 email composer.
//
// Pipeline per send:
//   1. selectTopHeadlines(days=1, limit=10) — same selection the website
//      uses, so the email and /dispatch always agree.
//   2. generateBannerImage() — fresh banner illustration prompted by the
//      day's top stories. Embedded inline as a data: URL.
//   3. renderTop10HtmlBase() — deterministic HTML template with logo,
//      banner, numbered list, footer. Always renders even if image gen
//      fails (logo-only header).
//   4. polishWithLlm() — Haiku-class LLM rewrites the subject, writes a
//      1-2 sentence intro, and proposes per-item commentary edits. On
//      parse/timeout failure we ship the deterministic base.

import OpenAI from "openai";
import { marked } from "marked";
import { selectTopHeadlines, type HeadlineRow } from "./top-headlines";
import {
  buildPromptFromHeadlines,
  generateBannerImage,
  type GeneratedImage,
} from "./image-gen";
import { generateMissingCommentary } from "./headline-commentator";
import { logger } from "./logger";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// Use the apex `www.` host for the logo so email clients that don't follow
// redirects on <img> requests (notably some Outlook builds) load it directly.
// Bare `deerpark.io` 307s to `www.deerpark.io`.
const PUBLIC_SITE_URL = (
  process.env["PUBLIC_SITE_URL"] ?? "https://www.deerpark.io"
).replace(/\/$/, "");
// Use the brand logo with a transparent background — favicon-192.png has a
// solid color square baked in (it's designed to look right as a browser-tab
// favicon), which made the email header look like the logo was sitting on
// a colored chip.
const LOGO_URL = `${PUBLIC_SITE_URL}/logo-icon.png`;

// Stable CID for the banner so the same constant is referenced both in the
// HTML <img src="cid:..."> and the Resend attachments[].content_id.
export const BANNER_CID = "banner.png";

export type ComposedEmail = {
  subject: string;
  html: string;
  text: string;
  headlineCount: number;
  bannerGenerated: boolean;
  polishApplied: boolean;
  /** The actual headlines included — caller may want to mark them sent. */
  headlines: HeadlineRow[];
  /**
   * Raw banner bytes. The sender attaches this inline via Resend's
   * `attachments[].content_id` so the binary rides in the MIME part
   * instead of bloating the HTML body. Gmail clips messages whose HTML
   * body exceeds ~102KB; a base64-inlined 1200x400 PNG blows past that
   * on its own and hides the entire top-10 behind "View entire message."
   */
  bannerImage: GeneratedImage | null;
};

export type ComposeOptions = {
  /** Public-facing unsubscribe URL for this recipient. */
  unsubscribeUrl: string;
  /** Public archive link. */
  archiveUrl: string;
  /** Override; default 1d / top 10. */
  days?: number;
  limit?: number;
};

/** Look up the day's top dispatch — exposed so callers can short-circuit
 * (e.g. status route reports candidate count without building the email). */
export async function loadTopHeadlinesForEmail(
  days = 1,
  limit = 10,
): Promise<HeadlineRow[]> {
  return selectTopHeadlines({ days, limit });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPtDate(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}

type RenderedItem = {
  id: number;
  number: number;
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  commentaryHtml: string;
};

function renderItems(headlines: HeadlineRow[]): RenderedItem[] {
  return headlines.map((h, i) => {
    const md = h.commentary ?? "";
    const commentaryHtml = md
      ? (marked.parse(md, { async: false }) as string)
      : "";
    return {
      id: h.id,
      number: i + 1,
      title: h.title,
      url: h.url,
      source: h.source,
      publishedAt: h.publishedAt,
      commentaryHtml,
    };
  });
}

function renderItemsHtml(items: RenderedItem[]): string {
  return items
    .map((it) => {
      const date = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(it.publishedAt);
      return `
<div style="margin:0 0 28px 0;padding:0 0 24px 0;border-bottom:1px solid #eaeaea;">
  <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:8px;font-family:ui-sans-serif,system-ui,sans-serif;">
    ${String(it.number).padStart(2, "0")} &middot; ${escapeHtml(it.source)} &middot; ${escapeHtml(date)}
  </div>
  <h2 style="font-size:18px;line-height:1.35;margin:0 0 10px 0;font-weight:600;font-family:ui-serif,Georgia,'Times New Roman',serif;">
    <a href="${escapeHtml(it.url)}" style="color:#111;text-decoration:none;">${escapeHtml(it.title)}</a>
  </h2>
  <div style="font-size:15px;line-height:1.6;color:#333;font-family:ui-sans-serif,system-ui,sans-serif;">
    ${it.commentaryHtml}
  </div>
</div>`;
    })
    .join("");
}

function renderHtml({
  subject,
  introHtml,
  itemsHtml,
  bannerSrc,
  unsubscribeUrl,
  archiveUrl,
  dateLabel,
}: {
  subject: string;
  introHtml: string;
  itemsHtml: string;
  /** Either a `cid:...` reference or null. Never a `data:` URL — see ComposedEmail.bannerImage. */
  bannerSrc: string | null;
  unsubscribeUrl: string;
  archiveUrl: string;
  dateLabel: string;
}): string {
  const banner = bannerSrc
    ? `<img src="${bannerSrc}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;margin:0 0 24px 0;" />`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fafafa;color:#111;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px 0;">
      <tr>
        <td style="vertical-align:middle;width:120px;">
          <img src="${LOGO_URL}" alt="DeerPark" width="26" height="40" style="display:block;border:0;outline:none;background:transparent;" />
        </td>
        <td style="vertical-align:middle;text-align:right;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;">
          Daily dispatch &middot; ${escapeHtml(dateLabel)}
        </td>
      </tr>
    </table>
    ${banner}
    <h1 style="font-size:26px;line-height:1.25;margin:0 0 16px 0;font-weight:600;font-family:ui-serif,Georgia,'Times New Roman',serif;color:#111;">
      ${escapeHtml(subject)}
    </h1>
    <div style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px 0;font-family:ui-sans-serif,system-ui,sans-serif;">
      ${introHtml}
    </div>
    ${itemsHtml}
    <hr style="border:0;border-top:1px solid #eaeaea;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.5;color:#888;font-family:ui-sans-serif,system-ui,sans-serif;">
      From the Deer Park dispatch.
      <a href="${escapeHtml(archiveUrl)}" style="color:#888;">Archive</a>
      &middot;
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}

function renderText(
  subject: string,
  intro: string,
  headlines: HeadlineRow[],
  unsubscribeUrl: string,
): string {
  const items = headlines
    .map((h, i) => {
      const num = String(i + 1).padStart(2, "0");
      const commentary = (h.commentary ?? "").replace(/\*\*/g, "");
      return `${num}. ${h.title}\n    ${h.source}\n    ${h.url}\n${commentary ? `\n    ${commentary}\n` : ""}`;
    })
    .join("\n");
  return `${subject}\n\n${intro}\n\n${items}\n\n---\nUnsubscribe: ${unsubscribeUrl}\n`;
}

// LLM polish step --------------------------------------------------------

type PolishResult = {
  subject: string;
  introHtml: string;
  edits: Map<number, string>;
};

const POLISH_SYSTEM_PROMPT = `You are an email editor for DeerPark's daily dispatch — a top-10 list of AI/tech headlines for enterprise AI buyers and operators.

Given the day's top-10 headlines and their existing commentary, produce:
1. A concise email subject line, under 70 characters, referencing the strongest story by name. No emoji. No "Daily Dispatch:" prefix.
2. A 1-2 sentence intro paragraph framing the day. Skeptical, concrete, naming actual companies. Plain prose, no list, no exclamation marks.
3. Optional light copy edits to existing commentary. Edit ONLY to reduce hedging or fix obvious clunk — never invent facts, dates, prices, or quotes. Skip items that don't need editing.

Return ONLY this JSON:
{
  "subject": "<string>",
  "intro": "<string, 1-2 sentences>",
  "edits": [{ "id": <number>, "replacement": "<string>" }]
}

Empty edits array is fine. No prose outside JSON.`;

function getPolishClient(): { client: OpenAI; model: string } | null {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = process.env["EMAIL_POLISH_MODEL"] ?? DEFAULT_MODEL;
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 4 * 60_000,
    maxRetries: 0,
  });
  return { client, model };
}

function parsePolishJson(text: string): {
  subject?: string;
  intro?: string;
  edits?: Array<{ id?: unknown; replacement?: unknown }>;
} | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function polishWithLlm(
  headlines: HeadlineRow[],
): Promise<PolishResult | null> {
  const setup = getPolishClient();
  if (!setup) return null;

  const corpus = headlines
    .map((h) => {
      const commentary = h.commentary ?? "(no commentary)";
      return `id=${h.id}\nSource: ${h.source}\nTitle: ${h.title}\nCommentary: ${commentary}`;
    })
    .join("\n---\n");

  try {
    const response = await setup.client.chat.completions.create({
      model: setup.model,
      max_tokens: 8192,
      messages: [
        { role: "system", content: POLISH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today's top ${headlines.length} headlines:\n\n${corpus}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = response.choices[0]?.message?.content ?? "";
    const parsed = parsePolishJson(text);
    if (!parsed) return null;
    const subject =
      typeof parsed.subject === "string" && parsed.subject.trim()
        ? parsed.subject.trim().slice(0, 100)
        : "";
    const introMd =
      typeof parsed.intro === "string" ? parsed.intro.trim() : "";
    if (!subject || !introMd) return null;
    const introHtml = marked.parse(introMd, { async: false }) as string;
    const edits = new Map<number, string>();
    if (Array.isArray(parsed.edits)) {
      const validIds = new Set(headlines.map((h) => h.id));
      for (const e of parsed.edits) {
        const id = Number(e.id);
        const replacement =
          typeof e.replacement === "string" ? e.replacement.trim() : "";
        if (!Number.isFinite(id) || !validIds.has(id)) continue;
        if (!replacement || replacement.length > 800) continue;
        edits.set(id, replacement);
      }
    }
    return { subject, introHtml, edits };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Email polish: request failed",
    );
    return null;
  }
}

// Composer ---------------------------------------------------------------

function fallbackSubject(headlines: HeadlineRow[]): string {
  const lead = headlines[0]?.title ?? "Today in AI";
  return `Daily dispatch — ${lead}`.slice(0, 100);
}

function fallbackIntroHtml(headlines: HeadlineRow[]): string {
  const sources = Array.from(
    new Set(headlines.slice(0, 3).map((h) => h.source)),
  );
  return `<p>Today's top ${headlines.length} from ${sources.join(", ")}${
    sources.length ? ", and more" : ""
  }.</p>`;
}

/**
 * Build the day's top-10 email for one recipient. The composition step
 * (LLM polish + image gen) is per-send, not per-recipient — caller is
 * responsible for caching when fanning out to many recipients. See
 * `composeDailyEmail` below for the per-day cached entry point.
 */
export async function composeDailyEmail(
  opts: ComposeOptions,
): Promise<ComposedEmail | null> {
  // Back-fill commentary for any top-eligible item that doesn't have it yet.
  // The commentator normally runs after each ingest tick (every 15 min) but
  // gets skipped when the judge stalls on rate-limit streaks — and then
  // top headlines land in the email with NULL commentary. Idempotent: a
  // no-op when every top-eligible row already has commentary, so the cost
  // is bounded by the actual gap to fill.
  try {
    const summary = await generateMissingCommentary();
    if (summary.commented > 0 || summary.errors > 0) {
      logger.info(
        { summary },
        "Email compose: pre-load commentary back-fill",
      );
    }
  } catch (err) {
    // Defensive — generateMissingCommentary swallows per-batch errors but
    // not setup errors (e.g. DB unavailable mid-call). We never want this
    // to abort the email composition.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Email compose: commentary back-fill threw — continuing without it",
    );
  }

  const headlines = await loadTopHeadlinesForEmail(opts.days ?? 1, opts.limit ?? 10);
  if (headlines.length === 0) return null;

  // Image gen + polish run in parallel — both are independent calls and the
  // total wall-clock cost is dominated by whichever is slower.
  const [bannerImage, polished] = await Promise.all([
    buildPromptFromHeadlines(headlines).then(generateBannerImage),
    polishWithLlm(headlines),
  ]);
  const bannerSrc = bannerImage ? `cid:${BANNER_CID}` : null;

  // Apply per-id commentary edits.
  const finalHeadlines = polished
    ? headlines.map((h) => {
        const replacement = polished.edits.get(h.id);
        return replacement ? { ...h, commentary: replacement } : h;
      })
    : headlines;

  const subject = polished?.subject ?? fallbackSubject(finalHeadlines);
  const introHtml = polished?.introHtml ?? fallbackIntroHtml(finalHeadlines);

  const items = renderItems(finalHeadlines);
  const itemsHtml = renderItemsHtml(items);
  const dateLabel = formatPtDate(new Date());

  const html = renderHtml({
    subject,
    introHtml,
    itemsHtml,
    bannerSrc,
    unsubscribeUrl: opts.unsubscribeUrl,
    archiveUrl: opts.archiveUrl,
    dateLabel,
  });

  // Strip HTML tags out of intro for the text fallback.
  const introText = introHtml.replace(/<[^>]+>/g, "").trim();
  const text = renderText(subject, introText, finalHeadlines, opts.unsubscribeUrl);

  return {
    subject,
    html,
    text,
    headlineCount: finalHeadlines.length,
    bannerGenerated: bannerImage !== null,
    polishApplied: polished !== null,
    headlines: finalHeadlines,
    bannerImage,
  };
}
