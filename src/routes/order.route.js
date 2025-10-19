import { Router } from "express";
import { isAdmin, isLoggedIn } from "../middlewares/auth.middleware.js";
import {
    createOrder,
    getOrderById,
    getUserOrders,
    getOrdersAdmin,
    updateOrderStatusAdmin,
} from '../controllers/order.controller.js'

const router = Router();

router.post("/checkout", isLoggedIn, createOrder);

router.get("/orders", isLoggedIn, getUserOrders);
router.get("/orders/:orderId", isLoggedIn, getOrderById);

router.get("/admin/orders",isLoggedIn, isAdmin, getOrdersAdmin);
router.patch("/orders/:orderId", isLoggedIn, isAdmin, updateOrderStatusAdmin);


export default router