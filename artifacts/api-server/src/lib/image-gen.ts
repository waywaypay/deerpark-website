// Banner-image generator for the daily top-10 email. Reuses LLM_API_KEY
// against Venice's image-generation endpoint so we don't need a second
// API key. Falls back to null on any error — the email composer ships
// without a banner rather than failing the send.

import { PNG } from "pngjs";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { HeadlineRow } from "./top-headlines";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "venice-sd35";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 400;
const TIMEOUT_MS = 90_000;
// Strip the bottom 12% of the generated banner. Venice burns its
// "generated with venice.ai" watermark into the bottom-right corner
// for non-Pro accounts and silently ignores `hide_watermark: true` on
// the API. 12% of 400 = 48px — comfortably above the watermark's
// ~25-30px text height with a safety margin, while preserving a wide
// editorial aspect ratio.
const WATERMARK_CROP_FRACTION = 0.12;

export type GeneratedImage = { base64: string; mimeType: string };

/**
 * Default banner prompt template. `{{stories}}` is substituted with a
 * "/"-joined string of the day's top three headline titles. Operators
 * can override the template via the admin UI; the substitution is the
 * only contract between template and runtime.
 */
export const DEFAULT_BANNER_PROMPT_TEMPLATE = [
  "Editorial illustration banner for an enterprise-AI daily news dispatch.",
  "Today's leading stories: {{stories}}.",
  "Muted, magazine-cover palette. No text, no logos, no UI elements.",
  "Wide aspect ratio, abstract conceptual composition over photorealism.",
].join(" ");

const BANNER_PROMPT_KEY = "email.banner_prompt_template";

function renderTemplate(template: string, stories: string): string {
  return template.replace(/\{\{\s*stories\s*\}\}/g, stories);
}

function storiesFromHeadlines(top: HeadlineRow[]): string {
  return top.slice(0, 3).map((h) => h.title).join(" / ");
}

/**
 * Compose the image prompt from the day's top headlines using the default
 * template. Synchronous — no DB lookup. Used as a fallback when the async
 * variant can't be awaited (and kept for backwards compatibility).
 */
export function buildPromptFromHeadlines(top: HeadlineRow[]): string {
  return renderTemplate(DEFAULT_BANNER_PROMPT_TEMPLATE, storiesFromHeadlines(top));
}

/**
 * Async variant that honors the operator-edited template stored in the
 * settings table. Falls back to the default template on lookup failure
 * so a DB hiccup doesn't break the banner.
 */
export async function buildPromptFromHeadlinesAsync(top: HeadlineRow[]): Promise<string> {
  const stories = storiesFromHeadlines(top);
  try {
    const { template } = await getBannerPromptTemplate();
    return renderTemplate(template, stories);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Banner prompt: settings lookup failed — using default template",
    );
    return renderTemplate(DEFAULT_BANNER_PROMPT_TEMPLATE, stories);
  }
}

export async function getBannerPromptTemplate(): Promise<{
  template: string;
  isCustom: boolean;
}> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, BANNER_PROMPT_KEY))
    .limit(1);
  if (row?.value) return { template: row.value, isCustom: true };
  return { template: DEFAULT_BANNER_PROMPT_TEMPLATE, isCustom: false };
}

export async function setBannerPromptTemplate(value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: BANNER_PROMPT_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function resetBannerPromptTemplate(): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, BANNER_PROMPT_KEY));
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
    const cropped = cropWatermark(b64);
    return { base64: cropped, mimeType: "image/png" };
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

/**
 * Trim the watermarked strip off the bottom of a Venice-generated banner.
 * Venice silently ignores the `hide_watermark: true` API parameter for
 * non-Pro accounts (and even with Pro, account/key linking can fail), so
 * we deterministically remove the watermark zone client-side: decode the
 * PNG, copy the top (1 - WATERMARK_CROP_FRACTION) of rows, re-encode.
 *
 * Pure JS (pngjs), no native bindings — keeps the Fly image lean. On any
 * decode/encode failure we return the original base64 unchanged rather
 * than failing the email send.
 */
function cropWatermark(base64: string): string {
  try {
    const buf = Buffer.from(base64, "base64");
    const src = PNG.sync.read(buf);
    const newHeight = Math.max(
      1,
      Math.floor(src.height * (1 - WATERMARK_CROP_FRACTION)),
    );
    if (newHeight >= src.height) return base64;
    const dst = new PNG({ width: src.width, height: newHeight });
    // PNG pixel buffers are row-major RGBA, so copying the first
    // newHeight rows is just a single byte-level slice.
    const bytesPerRow = src.width * 4;
    src.data.copy(dst.data, 0, 0, newHeight * bytesPerRow);
    return PNG.sync.write(dst).toString("base64");
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Image gen: watermark crop failed — returning original",
    );
    return base64;
  }
}
