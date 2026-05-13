// Vercel serverless function. Returns the deerpark-web SPA shell with
// per-post Open Graph + Twitter Card meta tags so iMessage/Slack/Twitter
// link unfurls show the post's title and dek instead of the global default.
//
// Wired up via vercel.json: /dispatch/:id → /api/og?id=:id (with /dispatch/archive
// carved out above as its own rewrite). The function self-fetches the SPA shell
// and validates `id` server-side; non-numeric ids redirect to /.
//
// CommonJS on purpose. The repo root has no `"type": "module"` in package.json,
// and a previous attempt to ship this as `.mjs` caused Vercel production deploys
// to fail (preview built clean, prod did not). CJS removes that variable.

const API_BASE = "https://deerpark-api.fly.dev";
const SITE_URL = "https://www.deerpark.io";
const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph.jpg`;

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function fetchSpaShell() {
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
  const items = Array.isArray(data && data.items) ? data.items : [];
  return items.find((p) => String(p.id) === String(id)) || null;
}

function injectMeta(html, fields) {
  const title = escapeHtml(fields.title);
  const description = escapeHtml(fields.description);
  const url = escapeHtml(fields.url);
  const image = escapeHtml(fields.image);

  const metaRe = (attr, name) =>
    new RegExp(`<meta\\s+${attr}="${name}"\\s+content="[^"]*"\\s*/?>`, "i");
  const meta = (attr, name, content) => `<meta ${attr}="${name}" content="${content}" />`;

  const replacements = [
    [/<title>[^<]*<\/title>/i, `<title>${title}</title>`],
    [metaRe("name", "description"), meta("name", "description", description)],
    [metaRe("property", "og:type"), meta("property", "og:type", "article")],
    [metaRe("property", "og:title"), meta("property", "og:title", title)],
    [metaRe("property", "og:description"), meta("property", "og:description", description)],
    [metaRe("property", "og:url"), meta("property", "og:url", url)],
    [metaRe("property", "og:image"), meta("property", "og:image", image)],
    [metaRe("name", "twitter:title"), meta("name", "twitter:title", title)],
    [metaRe("name", "twitter:description"), meta("name", "twitter:description", description)],
    [metaRe("name", "twitter:image"), meta("name", "twitter:image", image)],
    [/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}" />`],
  ];

  return replacements.reduce((out, [re, value]) => out.replace(re, value), html);
}

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").trim();
  if (!/^\d+$/.test(id)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }

  try {
    const [html, post] = await Promise.all([fetchSpaShell(), fetchPostById(id)]);

    if (!post) {
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
    console.error("og handler error", err);
    res.statusCode = 302;
    res.setHeader("Location", `/dispatch/${id}`);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
};
