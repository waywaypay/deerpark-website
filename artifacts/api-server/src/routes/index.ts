import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import headlinesRouter from "./headlines";
import postsRouter from "./posts";
import adminRouter from "./admin";
import subscribeRouter from "./subscribe";
import smsRouter from "./sms";
import smsAdminRouter from "./sms-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(headlinesRouter);
router.use(postsRouter);
router.use(adminRouter);
router.use(subscribeRouter);
router.use(smsRouter);
router.use(smsAdminRouter);

export default router;
