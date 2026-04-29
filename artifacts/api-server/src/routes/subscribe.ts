import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SUBSTACK_URL = "https://deerparkai.substack.com";

router.post("/subscribe", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  try {
    const substackRes = await fetch(`${SUBSTACK_URL}/api/v1/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        first_url: SUBSTACK_URL,
        first_referrer: "",
      }),
    });

    if (!substackRes.ok) {
      const text = await substackRes.text();
      req.log.warn({ status: substackRes.status, body: text }, "Substack subscribe failed");
      return res.status(502).json({ error: "Subscription failed, please try again" });
    }

    req.log.info({ email }, "Substack subscription created");
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Substack subscribe error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
