import { createPaymentIntent, handleWebhook } from "../services/payment.service.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * POST /payments/init
 * body: { orderId }
 */
//TODO: validation
export const initPayment = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const idempotencyKey = `order_${orderId}`;

    const result = await createPaymentIntent({ orderId, idempotencyKey });

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Payment Initialized successfully"));
})


/**
 * POST /payments/webhook
 * IMPORTANT: This endpoint must use raw body. See Express setup below.
 * Stripe calls this when payment intent status changes. We verify signature, parse event, act idempotently.
 */
export const webhookHandler = asyncHandler(async (req, res) => {
    try {
        const sig = req.headers["stripe-signature"];
        await handleWebhook(sig, req.body);

        return res
            .status(200)
            .send('ok');
    } catch (err) {
        console.error('Stripe webhook error:', err);
        throw new ApiError(500, `Webhook Error: ${err.message}`);
    }
})