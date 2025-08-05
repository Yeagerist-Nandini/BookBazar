import { Router } from "express";
import { isAdmin, isLoggedIn } from "../middlewares/auth.middleware";
import {
    createOrder,
    getOrderById,
    getUserOrders,
    getOrdersAdmin,
    updateOrderStatusAdmin,
    cancelOrder,
    paymentFailed,
    paymentSuccess
} from '../controllers/order.controller.js'

const router = Router();

router.post("/checkout", isLoggedIn, createOrder);

router.get("/orders", isLoggedIn, getUserOrders);
router.get("/orders/:orderId", isLoggedIn, getOrderById);
router.delete("orders/:orderId", isLoggedIn, cancelOrder);

router.get("admin/orders",isLoggedIn, isAdmin, getOrdersAdmin);
router.patch("/orders/:orderId", isLoggedIn, isAdmin, updateOrderStatusAdmin);

router.post("orders/:orderId/payment-success", paymentSuccess);
router.post("orders/:orderId/payment-failed", paymentFailed);

export default router