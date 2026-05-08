import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Browser CORS allowlist. The SPA on deerpark.io calls the API same-origin
// via the Vercel rewrite (vercel.json), so production browser traffic
// doesn't actually trigger CORS — this allowlist exists for the GH Pages
// mirror and for local dev. Extra origins can be added at boot via
// CORS_EXTRA_ORIGINS (comma-separated).
const STATIC_ORIGINS = new Set<string>([
  "https://deerpark.io",
  "https://www.deerpark.io",
  "https://backchannelai-lab.github.io",
]);
const EXTRA_ORIGINS = (process.env["CORS_EXTRA_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const o of EXTRA_ORIGINS) STATIC_ORIGINS.add(o);
const ALLOW_LOCALHOST = process.env["NODE_ENV"] !== "production";

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin / curl / server-side fetch (RSS readers, OG handler):
    // browsers send no Origin header; allow.
    if (!origin) return callback(null, true);
    if (STATIC_ORIGINS.has(origin)) return callback(null, true);
    if (ALLOW_LOCALHOST && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
// JSON / urlencoded parsers run for everything EXCEPT the Resend webhook —
// that path needs the raw request body to verify the Svix HMAC signature,
// and a JSON-parsed-then-re-serialized body wouldn't match. The webhook
// router installs its own express.raw() inside the route definition.
const SKIP_BODY_PARSE = /^\/api\/webhooks\/resend(\/|$)/;
app.use((req, res, next) => {
  if (SKIP_BODY_PARSE.test(req.path)) return next();
  return express.json()(req, res, next);
});
app.use((req, res, next) => {
  if (SKIP_BODY_PARSE.test(req.path)) return next();
  return express.urlencoded({ extended: true })(req, res, next);
});

app.use("/api", router);

export default app;
