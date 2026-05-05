// Vercel serverless function. Returns the deerpark-web SPA shell with
// per-post Open Graph + Twitter Card meta tags so iMessage/Slack/Twitter
// link unfurls show the post's title and dek instead of the global default.
//
// Wired up via vercel.json: /dispatch/:id(\d+) → /api/og?id=:id.
// The SPA shell (index.html) is bundled with this function via vercel.json
// `functions["api/og.mjs"].includeFiles` so we read from disk at startup rather
// than self-fetching from the same domain on every request.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const API_BASE = "https://deerpark-api.fly.dev";
const SITE_URL = "https://www.deerpark.io";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

// Resolve the SPA shell at module load. Vercel's includeFiles preserves the
// repo-relative path, so we walk a few likely candidates depending on where
// the function is bundled. Cached for the lifetime of the lambda instance.
function loadSpaShell() {
  const candidates = [
    join(process.cwd(), "artifacts/deerpark-web/dist/index.html"),
    join(process.cwd(), "../../artifacts/deerpark-web/dist/index.html"),
    join(process.cwd(), "../../../artifacts/deerpark-web/dist/index.html"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

const SPA_SHELL = loadSpaShell();

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function fetchPostById(id) {
  const res = await fetch(`${API_BASE}/api/posts?limit=50`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.find((p) => String(p.id) === String(id)) ?? null;
}

function injectMeta(html, { title, description, url, image }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImg = escapeHtml(image);

  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDesc}" />`,
    )
    .replace(
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="article" />`,
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`,
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${safeUrl}" />`,
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${safeImg}" />`,
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${safeTitle}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${safeDesc}" />`,
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:image" content="${safeImg}" />`,
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${safeUrl}" />`,
    );
}

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").trim();
  if (!/^\d+$/.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }

  if (!SPA_SHELL) {
    // includeFiles bundling didn't land — fall through to SPA so users still
    // get a working page; bots miss the per-post meta but it's recoverable.
    console.error("og handler: SPA shell not bundled — check vercel.json includeFiles");
    res.statusCode = 302;
    res.setHeader("Location", `/`);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }

  try {
    const post = await fetchPostById(id);

    if (!post) {
      // Post doesn't exist — serve unmodified shell, SPA renders 404.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      return res.end(SPA_SHELL);
    }

    const title = `${post.title} — DeerPark Dispatch`;
    const description = post.dek || "Daily AI analysis for enterprise operators.";
    const url = `${SITE_URL}/dispatch/${id}`;

    const out = injectMeta(SPA_SHELL, {
      title,
      description,
      url,
      image: DEFAULT_OG_IMAGE,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.end(out);
  } catch (err) {
    // Last-resort: redirect to the SPA root. Bots may miss the OG tags but
    // human visitors still get a working experience.
    console.error("og handler error", err);
    res.statusCode = 302;
    res.setHeader("Location", `/dispatch/${id}`);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
}
