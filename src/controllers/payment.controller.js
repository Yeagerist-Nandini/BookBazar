import { initPaymentForOrder } from "../services/payment.service.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const initPayment = asyncHandler(async(req, res) => {
    const { orderId } = req.body;
    const result = await initPaymentForOrder(orderId);

    return res
            .status(200)
            .json(new ApiResponse(200, result, "Payment Initialized successfully"));
})