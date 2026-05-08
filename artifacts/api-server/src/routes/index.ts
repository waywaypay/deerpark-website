import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import headlinesRouter from "./headlines";
import postsRouter from "./posts";
import dispatchRssRouter from "./dispatch-rss";
import digestRouter from "./digest";
import adminRouter from "./admin";
import subscribeRouter from "./subscribe";
import unsubscribeRouter from "./unsubscribe";
import smsRouter from "./sms";
import smsAdminRouter from "./sms-admin";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

// Webhooks first — /webhooks/resend installs its own express.raw() body
// parser. If the global express.json() at the app level ran ahead of it,
// the raw bytes needed to verify the Svix signature would be lost.
router.use(webhooksRouter);
router.use(healthRouter);
router.use(leadsRouter);
router.use(headlinesRouter);
router.use(postsRouter);
router.use(dispatchRssRouter);
router.use(digestRouter);
router.use(adminRouter);
router.use(subscribeRouter);
router.use(unsubscribeRouter);
router.use(smsRouter);
router.use(smsAdminRouter);

export default router;
