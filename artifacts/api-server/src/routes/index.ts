import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import headlinesRouter from "./headlines";
import postsRouter from "./posts";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(headlinesRouter);
router.use(postsRouter);
router.use(adminRouter);

export default router;
