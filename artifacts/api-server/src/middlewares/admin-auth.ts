import type { RequestHandler } from "express";

export const adminAuth: RequestHandler = (req, res, next) => {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) {
    return res.status(503).json({ error: "Admin disabled — ADMIN_SECRET not configured" });
  }

  const header = req.headers["authorization"];
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : (req.headers["x-admin-secret"] as string | undefined);

  if (!token || token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
};
