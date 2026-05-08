// Banner-image generator for the daily top-10 email. Reuses LLM_API_KEY
// against Venice's image-generation endpoint so we don't need a second
// API key. Falls back to null on any error — the email composer ships
// without a banner rather than failing the send.

import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { HeadlineRow } from "./top-headlines";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "venice-sd35";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 400;
const TIMEOUT_MS = 90_000;

export type GeneratedImage = { base64: string; mimeType: string };

// Editable from the admin email-agent screen. The {{headlines}} placeholder
// is substituted with a slash-separated list of the day's top story titles
// at send time. Anything else is passed through verbatim to Venice.
export const DEFAULT_BANNER_PROMPT_TEMPLATE = [
  "Editorial illustration banner for an enterprise-AI daily news dispatch.",
  "Today's leading stories: {{headlines}}.",
  "Muted, magazine-cover palette. No text, no logos, no UI elements.",
  "Wide aspect ratio, abstract conceptual composition over photorealism.",
].join(" ");

const PROMPT_SETTINGS_KEY = "email.banner.prompt_template";
const HEADLINES_PLACEHOLDER = "{{headlines}}";

export async function getBannerPrompt(): Promise<{ prompt: string; isCustom: boolean }> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, PROMPT_SETTINGS_KEY))
    .limit(1);
  if (row?.value) return { prompt: row.value, isCustom: true };
  return { prompt: DEFAULT_BANNER_PROMPT_TEMPLATE, isCustom: false };
}

export async function setBannerPrompt(value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: PROMPT_SETTINGS_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function resetBannerPrompt(): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, PROMPT_SETTINGS_KEY));
}

function formatHeadlinesForPrompt(top: HeadlineRow[]): string {
  return top
    .slice(0, 3)
    .map((h) => h.title)
    .join(" / ");
}

/**
 * Compose the image prompt from the day's top headlines. Reads the
 * editable template from settings (or falls back to the built-in default)
 * and substitutes the {{headlines}} placeholder. If the template lacks
 * the placeholder, headlines are appended so the model still has context.
 */
export async function buildPromptFromHeadlines(top: HeadlineRow[]): Promise<string> {
  const { prompt: template } = await getBannerPrompt();
  const headlines = formatHeadlinesForPrompt(top);
  if (template.includes(HEADLINES_PLACEHOLDER)) {
    return template.split(HEADLINES_PLACEHOLDER).join(headlines);
  }
  return `${template} Today's leading stories: ${headlines}.`;
}

type VeniceImageResponse = {
  images?: string[];
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

/**
 * POST to Venice's image-generation endpoint. Returns base64 PNG bytes
 * suitable for embedding as a `data:` URL in the email HTML.
 */
export async function generateBannerImage(
  prompt: string,
): Promise<GeneratedImage | null> {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) {
    logger.info("Image gen: LLM_API_KEY not set — skipping");
    return null;
  }
  const baseUrl = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = process.env["IMAGE_GEN_MODEL"] ?? DEFAULT_MODEL;
  const url = `${baseUrl.replace(/\/$/, "")}/image/generate`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        format: "png",
        return_binary: false,
        safe_mode: true,
        // Suppress Venice's "Generated with Venice.ai" watermark in the
        // bottom-right corner. Without this we ship a third-party logo
        // in our own newsletter banner.
        hide_watermark: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 500) },
        "Image gen: non-200 from provider",
      );
      return null;
    }

    const json = (await res.json()) as VeniceImageResponse;
    // Venice has shipped a couple shapes; tolerate both.
    const b64 =
      json.images?.[0] ??
      json.data?.[0]?.b64_json ??
      null;
    if (!b64) {
      logger.warn(
        { keys: Object.keys(json) },
        "Image gen: response missing base64 image",
      );
      return null;
    }
    return { base64: b64, mimeType: "image/png" };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Image gen: request failed",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** `data:` URL ready to drop into an <img src="..."/> attribute. */
export function asDataUrl(image: GeneratedImage): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}
