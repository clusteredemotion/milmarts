import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storefrontRouter from "./storefront";
import authRouter from "./auth";
import ordersRouter from "./orders";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import adminProductsRouter from "./admin-products";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(authRouter);
router.use(ordersRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(adminProductsRouter);

export default router;
