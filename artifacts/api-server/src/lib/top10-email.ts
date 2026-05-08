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

export type ComposeDiagnostics = {
  /** What happened on the polish call. */
  polishStatus:
    | "success"
    | "no_api_key"
    | "request_failed"
    | "parse_failed"
    | "missing_subject_or_intro";
  polishError?: string;
  /** Items polish returned commentary for. */
  polishCommentaryCount: number;
  /** Items the fallback commentary call rescued. 0 if fallback didn't run. */
  fallbackCommentaryCount: number;
  fallbackError?: string;
  /** Items in the final email that have any commentary at all. */
  finalCommentaryCount: number;
  /** Total headlines in the email. */
  headlineCount: number;
};

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
  /** What happened during compose — surfaced in admin/test-send responses. */
  diagnostics: ComposeDiagnostics;
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
//
// One LLM call produces subject + intro + per-item commentary in a single
// round-trip. This decouples the email's commentary from the standalone
// headline-commentator pipeline, which keeps stalling on Venice rate-limit
// streaks (commits #92, #93). The commentator still runs on its 15-min
// ingest tick to populate the website's /dispatch view; the email no
// longer waits on it.

type PolishResult = {
  subject: string;
  introHtml: string;
  /** Commentary text per headline id. Always covers every input id. */
  commentary: Map<number, string>;
};

/**
 * Outcome envelope so the composer can surface *why* polish failed in
 * test-send diagnostics. Without this we just see "no commentary" and
 * have to guess between rate-limits, parse errors, missing keys, etc.
 */
type PolishOutcome =
  | { ok: true; result: PolishResult }
  | {
      ok: false;
      reason:
        | "no_api_key"
        | "request_failed"
        | "parse_failed"
        | "missing_subject_or_intro";
      error?: string;
    };

const POLISH_SYSTEM_PROMPT = `You are the editor of DeerPark's daily dispatch — a top-10 newsletter of AI and tech headlines for enterprise AI buyers and operators (CIOs, IT directors, AI program owners).

Given the day's top-10 headlines, produce three things in a single JSON object.

1. SUBJECT — concise email subject under 70 characters referencing the strongest story by name. No emoji. No "Daily Dispatch:" prefix.

2. INTRO — 1-2 sentence paragraph framing the day. Skeptical, concrete, naming actual companies. Plain prose. No list. No exclamation marks.

3. COMMENTARY for EVERY item — 2-4 sentences each. Lead with the publisher and what shipped: "Anthropic released X." or "OpenAI announced Y." Bold the lead clause with markdown asterisks. Then 1-3 sentences of plain prose commentary that does at least one of:
   - Contextualize: where this fits in the market
   - Qualify: what's missing or unspecified
   - Pressure-test: what the announcement does NOT prove

HARD RULES for commentary:
- 2-4 sentences total per item including the bolded lead. No shorter than 2, no longer than 4.
- Use the source name as the publisher. When the source is the originator (e.g. "Anthropic" for an anthropic.com post), say "Anthropic announced..." or "Anthropic released...". When the source is press coverage (e.g. "Bloomberg Technology"), say "Bloomberg reports..." or "per Bloomberg".
- Every claim must be implied by the headline title or general knowledge of the named company. Do not invent metrics, dates, prices, or quotes.
- No exclamation marks. No em-dash chains (more than one — per sentence).
- Banned phrases: "what's interesting is", "in a world where", "speaks volumes", "sends a clear message", "not just X but Y", "isn't merely", "more than just", "what's striking", "in an era of".
- If existing commentary is provided in the input you may keep it, lightly edit, or replace it — but every item MUST have commentary in the output.

Return ONLY this JSON, no prose outside it:
{
  "subject": "<string>",
  "intro": "<string, 1-2 sentences>",
  "items": [{ "id": <number>, "commentary": "<2-4 sentences with bolded lead>" }, ...]
}

One entry per input id. No omissions. No extra ids.`;

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
  items?: Array<{ id?: unknown; commentary?: unknown }>;
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
): Promise<PolishOutcome> {
  const setup = getPolishClient();
  if (!setup) return { ok: false, reason: "no_api_key" };

  const corpus = headlines
    .map((h) => {
      const commentary = h.commentary ?? "(no commentary)";
      return `id=${h.id}\nSource: ${h.source}\nTitle: ${h.title}\nCommentary: ${commentary}`;
    })
    .join("\n---\n");

  let text = "";
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
    text = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Email polish: request failed");
    return { ok: false, reason: "request_failed", error: msg };
  }

  const parsed = parsePolishJson(text);
  if (!parsed) {
    logger.warn(
      { textPreview: text.slice(0, 300) },
      "Email polish: parse failed",
    );
    return { ok: false, reason: "parse_failed", error: text.slice(0, 200) };
  }
  const subject =
    typeof parsed.subject === "string" && parsed.subject.trim()
      ? parsed.subject.trim().slice(0, 100)
      : "";
  const introMd =
    typeof parsed.intro === "string" ? parsed.intro.trim() : "";
  if (!subject || !introMd) {
    return { ok: false, reason: "missing_subject_or_intro" };
  }
  const introHtml = marked.parse(introMd, { async: false }) as string;
  const commentary = new Map<number, string>();
  if (Array.isArray(parsed.items)) {
    const validIds = new Set(headlines.map((h) => h.id));
    for (const e of parsed.items) {
      const id = Number(e.id);
      const itemText =
        typeof e.commentary === "string" ? e.commentary.trim() : "";
      if (!Number.isFinite(id) || !validIds.has(id)) continue;
      if (!itemText || itemText.length > 800) continue;
      commentary.set(id, itemText);
    }
  }
  return { ok: true, result: { subject, introHtml, commentary } };
}

/**
 * Last-resort commentary call. Fires only when the main polish step
 * leaves some items without commentary. Smaller prompt + smaller output
 * — less context for the model to drop, less likely to trip whatever
 * 429 pattern hit polish.
 */
const COMMENTARY_FALLBACK_PROMPT = `You write 2-4 sentence commentary for AI/tech headlines aimed at enterprise AI buyers and operators (CIOs, IT directors, AI program owners). Skeptical, concrete, naming actual companies.

For each input headline, produce 2-4 sentences. Lead with the publisher and what shipped: "Anthropic released X." or "OpenAI announced Y." Bold the lead clause with markdown asterisks. Then 1-3 sentences of plain prose commentary that contextualizes, qualifies, or pressure-tests the headline.

HARD RULES
- 2-4 sentences total per item including the bolded lead.
- Use the source name as the publisher.
- Every claim must be implied by the headline title or general knowledge of the named company. Do not invent metrics, dates, prices, or quotes.
- No exclamation marks. No banned phrases ("what's interesting", "in a world where", "speaks volumes", "isn't merely", "more than just", "in an era of").

Return ONLY this JSON:
{ "items": [{ "id": <number>, "commentary": "<2-4 sentences>" }, ...] }

One entry per input id.`;

async function backfillCommentaryViaLlm(
  missing: HeadlineRow[],
): Promise<{ commentary: Map<number, string>; error?: string }> {
  const result: Map<number, string> = new Map();
  if (missing.length === 0) return { commentary: result };
  const setup = getPolishClient();
  if (!setup) return { commentary: result, error: "no_api_key" };

  const corpus = missing
    .map(
      (h) => `id=${h.id}\nSource: ${h.source}\nTitle: ${h.title}`,
    )
    .join("\n---\n");

  try {
    const response = await setup.client.chat.completions.create({
      model: setup.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: COMMENTARY_FALLBACK_PROMPT },
        {
          role: "user",
          content: `Write commentary for these ${missing.length} headlines:\n\n${corpus}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const text = response.choices[0]?.message?.content ?? "";
    const parsed = parsePolishJson(text);
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      return { commentary: result, error: "parse_failed" };
    }
    const validIds = new Set(missing.map((h) => h.id));
    for (const e of parsed.items) {
      const id = Number(e.id);
      const itemText =
        typeof e.commentary === "string" ? e.commentary.trim() : "";
      if (!Number.isFinite(id) || !validIds.has(id)) continue;
      if (!itemText || itemText.length > 800) continue;
      result.set(id, itemText);
    }
    return { commentary: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Email commentary fallback: request failed");
    return { commentary: result, error: msg };
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
  const [bannerImage, polishOutcome] = await Promise.all([
    generateBannerImage(buildPromptFromHeadlines(headlines)),
    polishWithLlm(headlines),
  ]);
  const bannerSrc = bannerImage ? `cid:${BANNER_CID}` : null;

  // Merge sources of truth for commentary:
  //   1. Polish result (the main LLM call)
  //   2. DB commentary (whatever the standalone commentator wrote)
  // Track which items still have nothing so we can fire the fallback call.
  const polishedMap = polishOutcome.ok
    ? polishOutcome.result.commentary
    : new Map<number, string>();
  let mergedHeadlines = headlines.map((h) => {
    const polishedText = polishedMap.get(h.id);
    if (polishedText) return { ...h, commentary: polishedText };
    return h;
  });

  // Last-resort: if any items still have empty commentary, ask the LLM
  // again — but ONLY for those items, with a smaller prompt. Catches
  // the case where polish succeeded structurally but dropped items, AND
  // the case where polish failed entirely.
  let fallbackCommentaryCount = 0;
  let fallbackError: string | undefined;
  const stillMissing = mergedHeadlines.filter((h) => !h.commentary);
  if (stillMissing.length > 0) {
    const { commentary: fallbackMap, error } = await backfillCommentaryViaLlm(stillMissing);
    fallbackCommentaryCount = fallbackMap.size;
    fallbackError = error;
    if (fallbackMap.size > 0) {
      mergedHeadlines = mergedHeadlines.map((h) => {
        const fb = fallbackMap.get(h.id);
        return fb ? { ...h, commentary: fb } : h;
      });
    }
  }

  const finalHeadlines = mergedHeadlines;
  const subject = polishOutcome.ok
    ? polishOutcome.result.subject
    : fallbackSubject(finalHeadlines);
  const introHtml = polishOutcome.ok
    ? polishOutcome.result.introHtml
    : fallbackIntroHtml(finalHeadlines);

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

  const diagnostics: ComposeDiagnostics = {
    polishStatus: polishOutcome.ok ? "success" : polishOutcome.reason,
    polishError: polishOutcome.ok ? undefined : polishOutcome.error,
    polishCommentaryCount: polishedMap.size,
    fallbackCommentaryCount,
    fallbackError,
    finalCommentaryCount: finalHeadlines.filter((h) => h.commentary).length,
    headlineCount: finalHeadlines.length,
  };

  logger.info({ diagnostics }, "Email compose: complete");

  return {
    subject,
    html,
    text,
    headlineCount: finalHeadlines.length,
    bannerGenerated: bannerImage !== null,
    polishApplied: polishOutcome.ok,
    headlines: finalHeadlines,
    bannerImage,
    diagnostics,
  };
}
