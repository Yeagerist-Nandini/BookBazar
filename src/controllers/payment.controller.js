import { initPaymentForOrder } from "../services/payment.controller";
import { asyncHandler } from "../utils/asyncHandler.js";

export const initPayment = asyncHandler(async(req, res) => {
    const { orderId } = req.body;
    const result = await initPaymentForOrder(orderId);
})