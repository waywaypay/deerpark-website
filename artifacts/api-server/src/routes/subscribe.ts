import { Router, type IRouter } from "express";
import { db, subscribersTable, insertSubscriberSchema } from "@workspace/db";

const router: IRouter = Router();

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

async function pushToBeehiiv(email: string, source: string | null | undefined, log: { warn: (...args: unknown[]) => void }) {
  const apiKey = process.env["BEEHIIV_API_KEY"];
  const pubId = process.env["BEEHIIV_PUBLICATION_ID"];
  if (!apiKey || !pubId) {
    log.warn({ hasKey: !!apiKey, hasPubId: !!pubId }, "Beehiiv env vars missing — skipping remote subscribe");
    return { ok: false, reason: "not_configured" as const };
  }

  const res = await fetch(`${BEEHIIV_API_BASE}/publications/${pubId}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      reactivate_existing: true,
      send_welcome_email: true,
      utm_source: source ?? "deerpark-website",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.warn({ status: res.status, body }, "Beehiiv subscribe failed");
    return { ok: false, reason: "api_error" as const, status: res.status };
  }

  return { ok: true as const };
}

router.post("/subscribe", async (req, res) => {
  const parsed = insertSubscriberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Valid email required",
      issues: parsed.error.issues,
    });
  }

  try {
    await db
      .insert(subscribersTable)
      .values(parsed.data)
      .onConflictDoNothing({ target: subscribersTable.email });
  } catch (err) {
    req.log.error({ err }, "Failed to insert subscriber");
    return res.status(500).json({ error: "Internal server error" });
  }

  const remote = await pushToBeehiiv(parsed.data.email, parsed.data.source, req.log).catch(
    (err) => {
      req.log.warn({ err }, "Beehiiv subscribe threw");
      return { ok: false, reason: "exception" as const };
    },
  );

  req.log.info({ email: parsed.data.email, beehiiv: remote.ok }, "Subscriber captured");
  return res.status(200).json({ ok: true });
});

export default router;
