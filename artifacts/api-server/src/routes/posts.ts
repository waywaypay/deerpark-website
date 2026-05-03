import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/posts", async (req, res) => {
  const rawLimit = Number(req.query["limit"]);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 14;

  try {
    const rows = await db
      .select({
        id: postsTable.id,
        agentId: postsTable.agentId,
        mode: postsTable.mode,
        tag: postsTable.tag,
        title: postsTable.title,
        dek: postsTable.dek,
        bodyMarkdown: postsTable.bodyMarkdown,
        citations: postsTable.citations,
        sourceHeadlineIds: postsTable.sourceHeadlineIds,
        publishedAt: postsTable.publishedAt,
      })
      .from(postsTable)
      .orderBy(desc(postsTable.publishedAt))
      .limit(limit);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to load posts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
