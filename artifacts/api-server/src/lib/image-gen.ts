// Banner-image generator for the daily top-10 email. Reuses LLM_API_KEY
// against Venice's image-generation endpoint so we don't need a second
// API key. Falls back to null on any error — the email composer ships
// without a banner rather than failing the send.

import { logger } from "./logger";
import type { HeadlineRow } from "./top-headlines";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "venice-sd35";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 400;
const TIMEOUT_MS = 90_000;

export type GeneratedImage = { base64: string; mimeType: string };

/**
 * Compose the image prompt from the day's top headlines. Editorial style,
 * muted palette, no text — the title text comes from the email body.
 */
export function buildPromptFromHeadlines(top: HeadlineRow[]): string {
  const stories = top
    .slice(0, 3)
    .map((h) => h.title)
    .join(" / ");
  return [
    "Editorial illustration banner for an enterprise-AI daily news dispatch.",
    `Today's leading stories: ${stories}.`,
    "Muted, magazine-cover palette. No text, no logos, no UI elements.",
    "Wide aspect ratio, abstract conceptual composition over photorealism.",
  ].join(" ");
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
