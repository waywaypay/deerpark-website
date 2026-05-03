import { Router, type IRouter } from "express";
import { unsubscribeByToken } from "../lib/daily-digest";

const router: IRouter = Router();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#222;line-height:1.5}h1{font-size:22px;margin:0 0 16px}p{margin:0 0 12px;color:#444}a{color:#1f5fff}</style></head><body>${body}</body></html>`;
}

/**
 * Unsubscribe link target. Idempotent — clicking again is fine. Accepts both
 * GET (link click in email) and POST (RFC 8058 one-click unsubscribe).
 */
async function handle(req: Parameters<Parameters<IRouter["get"]>[1]>[0], res: Parameters<Parameters<IRouter["get"]>[1]>[1]): Promise<void> {
  const token = String(req.query["token"] ?? req.body?.token ?? "");
  if (!token) {
    res.status(400).type("html").send(page("<h1>Unsubscribe link is missing its token.</h1><p>Make sure you used the link from the email exactly as it appears.</p>"));
    return;
  }

  try {
    const email = await unsubscribeByToken(token);
    if (!email) {
      res.status(404).type("html").send(page("<h1>This link doesn't match any subscriber.</h1><p>The link may have been mistyped. If you keep getting unwanted emails, reply to one of them and we'll handle it manually.</p>"));
      return;
    }
    res.type("html").send(
      page(
        `<h1>You're unsubscribed.</h1><p>${escapeHtml(email)} will no longer receive the daily digest.</p><p>Changed your mind? Resubscribe at <a href="https://deerpark.io/dispatch">deerpark.io/dispatch</a>.</p>`,
      ),
    );
  } catch (err) {
    req.log.error({ err }, "Unsubscribe failed");
    res.status(500).type("html").send(page("<h1>Something went wrong.</h1><p>Please reply to one of the emails and we'll unsubscribe you manually.</p>"));
  }
}

router.get("/unsubscribe", (req, res) => {
  handle(req, res).catch((err) => {
    req.log.error({ err }, "Unsubscribe handler threw");
    if (!res.headersSent) res.status(500).send("error");
  });
});

router.post("/unsubscribe", (req, res) => {
  handle(req, res).catch((err) => {
    req.log.error({ err }, "Unsubscribe handler threw");
    if (!res.headersSent) res.status(500).send("error");
  });
});

export default router;
