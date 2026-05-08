// Banner-image generator for the daily top-10 email. Reuses LLM_API_KEY
// against Venice's image-generation endpoint so we don't need a second
// API key. Falls back to null on any error — the email composer ships
// without a banner rather than failing the send.

import { PNG } from "pngjs";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { HeadlineRow } from "./top-headlines";
import { logUsage } from "./llm-usage";

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
 * Curated rotation of primary visual motifs. The model otherwise converges
 * to "mountains under a sun" regardless of the day's stories, so we pick
 * one motif per UTC day and inject it as the primary subject. Keep these
 * compatible with the rest of the prompt (2–4 large shapes, negative
 * space, no horizons-with-sun) so style stays consistent across the rotation.
 */
const BANNER_MOTIFS = [
  "an empty open doorway with soft light beyond",
  "a single bird mid-flight against a blank field",
  "a lone tree silhouette in negative space",
  "stacked architectural blocks at a slight isometric tilt",
  "a quiet tabletop still life with a vessel and folded cloth",
  "a winding footpath receding into negative space",
  "an open window frame with a sliver of sky",
  "stone arches in repetition, partly cropped",
  "a small wooden bridge crossing flat water, side view",
  "drifting low clouds across a flat plain",
  "a folded paper letter on a plain surface",
  "concentric ripples on still water, top-down view",
  "an empty wooden chair in a plain room",
  "a row of standing stones at an oblique angle",
  "a single ladder leaning against a flat wall",
  "a single seedling in a plain pot",
  "an open envelope with a folded note inside",
  "a stack of stones balanced in an empty field",
  "a path of stepping stones across still water",
  "a single hanging lantern in negative space",
  "an open book lying flat on a plain surface",
  "a small sailboat low in the frame on still water",
  "a curtain catching air in an otherwise empty room",
  "a tiled rooftop, partial, at an oblique angle",
  "a single column standing alone in a plain field",
];

function pickMotif(now: Date = new Date()): string {
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  return BANNER_MOTIFS[dayIndex % BANNER_MOTIFS.length]!;
}

/**
 * Default banner prompt template. `{{motif}}` is the day's rotated
 * primary subject; `{{stories}}` is a "/"-joined string of the top three
 * headline titles, used only as atmospheric context. Operators can
 * override the template via the admin UI; the substitution tokens are
 * the only contract between template and runtime.
 */
export const DEFAULT_BANNER_PROMPT_TEMPLATE = [
  "Wide horizontal editorial banner image for DeerPark.",
  "",
  "Primary subject: {{motif}}. This is what is actually depicted in the image.",
  "",
  "This banner accompanies a newsletter about: {{stories}}. The illustration may evoke this thematic material through mood and color, but the primary subject above is what is drawn — not the stories themselves.",
  "",
  "Style reference: modern print magazine illustration, not digital concept art.",
  "",
  "Use only 2–4 large shapes in the composition. Large areas of negative space. Minimal object count. No centered focal point.",
  "",
  "Flat matte shading only. Soft edge transitions. Very limited detail. Slight paper grain texture.",
  "",
  "Color palette restricted to dark forest green, olive gray, faded sage, charcoal, and warm stone. Low saturation.",
  "",
  "Composition should feel quiet, restrained, and intentionally incomplete rather than fully rendered.",
  "",
  "Avoid realism. Avoid spectacle. Avoid polished gradients. Avoid glow effects. Avoid depth-of-field blur. Avoid dramatic lighting. Avoid reflections. Avoid chrome. Avoid futuristic imagery. Avoid UI overlays. Avoid tiny details. Avoid symmetry. Avoid “beautiful” rendering. Avoid mountains. Avoid suns, sunrises, and sunsets.",
  "",
  "The image should resemble an art-directed magazine illustration scanned from print, with subtle imperfection and restraint.",
  "",
  "No text or logos. No Chinese characters or any other written language.",
].join("\n");

const BANNER_PROMPT_KEY = "email.banner_prompt_template";

function renderTemplate(
  template: string,
  params: { stories: string; motif: string },
): string {
  return template
    .replace(/\{\{\s*stories\s*\}\}/g, params.stories)
    .replace(/\{\{\s*motif\s*\}\}/g, params.motif);
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
  return renderTemplate(DEFAULT_BANNER_PROMPT_TEMPLATE, {
    stories: storiesFromHeadlines(top),
    motif: pickMotif(),
  });
}

/**
 * Async variant that honors the operator-edited template stored in the
 * settings table. Falls back to the default template on lookup failure
 * so a DB hiccup doesn't break the banner.
 */
export async function buildPromptFromHeadlinesAsync(top: HeadlineRow[]): Promise<string> {
  const params = { stories: storiesFromHeadlines(top), motif: pickMotif() };
  try {
    const { template } = await getBannerPromptTemplate();
    return renderTemplate(template, params);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Banner prompt: settings lookup failed — using default template",
    );
    return renderTemplate(DEFAULT_BANNER_PROMPT_TEMPLATE, params);
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
    await logUsage({ caller: "image_gen", callKind: "image", model });
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
