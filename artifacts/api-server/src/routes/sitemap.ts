import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

const SITE_URL = (process.env["PUBLIC_SITE_URL"] ?? "https://www.deerpark.io").replace(
  /\/$/,
  "",
);

// Routes the SPA serves. Mirrors the wouter routes in
// artifacts/deerpark-web/src/App.tsx — /admin is omitted on purpose
// (robots.txt disallows it).
const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/dispatch", changefreq: "daily", priority: "0.9" },
  { path: "/dispatch/archive", changefreq: "daily", priority: "0.7" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

router.get("/sitemap.xml", async (req, res) => {
  // Mirror the RSS feed's cap — 50 most recent posts is plenty for long-tail
  // indexing and keeps the XML small.
  let posts: { id: number; publishedAt: Date }[] = [];
  try {
    posts = await db
      .select({
        id: postsTable.id,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .orderBy(desc(postsTable.publishedAt))
      .limit(50);
  } catch (err) {
    // Don't 500 the sitemap if the DB hiccups — fall back to the static
    // routes so crawlers still get something useful.
    req.log.error({ err }, "sitemap: failed to load posts; serving static only");
  }

  const today = isoDate(new Date());

  const staticEntries = STATIC_ROUTES.map(
    (r) =>
      `  <url>
    <loc>${escapeXml(`${SITE_URL}${r.path}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  ).join("\n");

  const postEntries = posts
    .map(
      (p) =>
        `  <url>
    <loc>${escapeXml(`${SITE_URL}/dispatch/${p.id}`)}</loc>
    <lastmod>${isoDate(p.publishedAt)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}${postEntries ? `\n${postEntries}` : ""}
</urlset>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // 5 minutes browser, 15 minutes CDN — Googlebot won't refetch faster than
  // that anyway.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
  return res.send(body);
});

export default router;
