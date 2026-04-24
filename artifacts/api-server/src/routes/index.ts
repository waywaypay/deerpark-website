import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import headlinesRouter from "./headlines";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(headlinesRouter);

export default router;
