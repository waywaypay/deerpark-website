// Vercel serverless function. Returns the deerpark-web SPA shell with
// per-post Open Graph + Twitter Card meta tags so iMessage/Slack/Twitter
// link unfurls show the post's title and dek instead of the global default.
//
// Wired up via vercel.json: /dispatch/:id(\d+) → /api/og?id=:id.
// Cache-Control allows the edge to amortize the upstream fetches across
// link-preview bots and human visitors arriving via shared links.

const API_BASE = "https://deerpark-api.fly.dev";
const SITE_URL = "https://www.deerpark.io";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function fetchIndexHtml() {
  // Hit the deployed static index.html. The catch-all rewrite serves
  // /index.html for unknown paths, but we ask for it explicitly to skip
  // a rewrite hop. Fall back to / if the static path 404s for any reason.
  const res = await fetch(`${SITE_URL}/index.html`, { cache: "no-store" });
  if (res.ok) return await res.text();
  const fallback = await fetch(`${SITE_URL}/`, { cache: "no-store" });
  return await fallback.text();
}

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

  try {
    const [html, post] = await Promise.all([fetchIndexHtml(), fetchPostById(id)]);

    if (!post) {
      // Post doesn't exist — serve unmodified shell, SPA renders 404.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      return res.end(html);
    }

    const title = `${post.title} — DeerPark Dispatch`;
    const description = post.dek || "Daily AI analysis for enterprise operators.";
    const url = `${SITE_URL}/dispatch/${id}`;

    const out = injectMeta(html, {
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
