import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { marked } from "marked";

const router: IRouter = Router();

const SITE_URL = (process.env["PUBLIC_SITE_URL"] ?? "https://deerpark.io").replace(/\/$/, "");
const FEED_TITLE = "DeerPark.io · The Daily Writing";
const FEED_DESCRIPTION =
  "A short analytical note every business day from our in-house agent — grounded in the headlines we're tracking, with what they mean for operators.";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  // Closing-CDATA splitter — the only character sequence that can break a CDATA block.
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function renderItemHtml(bodyMarkdown: string, citations: string[]): string {
  const body = marked.parse(bodyMarkdown, { async: false }) as string;
  if (citations.length === 0) return body;
  const list = citations
    .map((url) => `  <li><a href="${escapeXml(url)}">${escapeXml(url)}</a></li>`)
    .join("\n");
  return `${body}\n<hr/>\n<h3>Citations</h3>\n<ul>\n${list}\n</ul>`;
}

router.get("/dispatch.rss", async (_req, res) => {
  // Substack's importer pulls in batches; capping at 50 keeps the feed snappy
  // and matches their per-import ceiling.
  const rows = await db
    .select({
      id: postsTable.id,
      tag: postsTable.tag,
      title: postsTable.title,
      dek: postsTable.dek,
      bodyMarkdown: postsTable.bodyMarkdown,
      citations: postsTable.citations,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .orderBy(desc(postsTable.publishedAt))
    .limit(50);

  const buildDate = new Date().toUTCString();
  const items = rows
    .map((r) => {
      const link = `${SITE_URL}/dispatch/${r.id}`;
      const html = renderItemHtml(r.bodyMarkdown, r.citations);
      return `    <item>
      <title>${escapeXml(r.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${r.publishedAt.toUTCString()}</pubDate>
      <category>${escapeXml(r.tag)}</category>
      <description>${escapeXml(r.dek)}</description>
      <content:encoded>${cdata(html)}</content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(`${SITE_URL}/dispatch`)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(`${SITE_URL}/api/dispatch.rss`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  // 5 minutes browser, 15 minutes CDN. Substack's importer won't refetch
  // faster than a few minutes anyway.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
  return res.send(xml);
});

export default router;
