import { createPaymentIntentForOrder } from "../services/payment.service.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


/**
 * POST /payments/init
 * body: { orderId }
 */
//TODO: validation
export const initPayment = asyncHandler(async(req, res) => {
    const { orderId } = req.body;
    const idempotencyKey = req;

    const result = await createPaymentIntentForOrder({orderId, idempotencyKey});

    return res
            .status(200)
            .json(new ApiResponse(200, result, "Payment Initialized successfully"));
})


/**
 * POST /payments/webhook
 * IMPORTANT: This endpoint must use raw body. See Express setup below.
 * Stripe calls this when payment intent status changes. We verify signature, parse event, act idempotently.
 */

export const webhookHandler = asyncHandler(async(req, res) => {
    
})