import { Router, type IRouter } from "express";
import express from "express";
import {
  recordResendEvent,
  verifyResendSignature,
} from "../lib/email-events";

const router: IRouter = Router();

// Resend signs webhooks via Svix. We MUST hash the raw request body, so
// this route uses express.raw() rather than the global express.json() —
// JSON-parsed-and-re-serialized bytes won't match the original signature.
router.post(
  "/webhooks/resend",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ ok: false, error: "Expected raw body" });
    }

    const svixId = req.header("svix-id") ?? undefined;
    const svixTimestamp = req.header("svix-timestamp") ?? undefined;
    const svixSignature = req.header("svix-signature") ?? undefined;

    const verification = verifyResendSignature(rawBody, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });
    if (!verification.ok) {
      req.log.warn({ reason: verification.reason }, "Resend webhook: signature rejected");
      return res.status(401).json({ ok: false, error: verification.reason });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      req.log.warn({ err }, "Resend webhook: invalid JSON");
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }

    // svix-id is the idempotency key. Any retry of the same delivery hits
    // the unique-constraint and ON CONFLICT DO NOTHING — no double-counts.
    const providerEventId = svixId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const result = await recordResendEvent(payload, providerEventId);
      if (result.inserted) {
        req.log.info(
          { eventType: result.eventType, email: result.email },
          "Resend webhook: event recorded",
        );
      }
      // Always 200 — Svix retries non-2xx and we don't want loops on
      // unparseable shapes (we log them above) or duplicate IDs.
      return res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "Resend webhook: persistence failed");
      // 5xx triggers Svix retries — appropriate for transient DB errors.
      return res.status(500).json({ ok: false, error: "Persistence failed" });
    }
  },
);

export default router;
