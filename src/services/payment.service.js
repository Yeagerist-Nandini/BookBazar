import Stripe from "stripe"
import { ApiError } from "../utils/api-error.js"
import { db } from "../utils/db.js"
import dotenv from "dotenv"

dotenv.config();


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Razorpay order and persist Payment row (PENDING).
 * Returns { razorpay_order_id, amount, currency, key_id } for frontend.
 */
export const createPaymentIntentForOrder = async({orderId, idempotencyKey}) => {
    //1. load order
    const order = await db.order.findUnique({ where: {orderId} })

    if(!order) throw new ApiError(404, "Order not found");
    if(order.status !== "PAYMENT_PENDING") throw new ApiError(400, `Order ${orderId} not payable (status=${order.status})`);

    //2. create payment intent 
    const amount = Number(order.totalAmount) * 100;
    const currency = (process.env.PAYMENT_CURRENCY || "inr").toLowerCase();

    const params = {
        amount: Math.round(amount),
        currency,
        metadata: { orderId },
    };

    const requestOptions = {};
    if (idempotencyKey) requestOptions.idempotencyKey = idempotencyKey;

    const intent = await stripe.paymentIntents.create(params, requestOptions);

    // 3. persist Payment row (idempotent create logic)
    // If a Payment entry already exists for this order with same transactionId -> skip create
    const existing = await db.payment.findFirst({ where: { orderId, transactionId: intent.id} });
    if(!existing){
        await db.payment.create({
            data: {
                orderId,
                status: "PENDING",
                transactionId: intent.id
            }
        });
    }

    //4. Return client_secret to frontend
    return {
        client_secret: intent.client_secret,
        payment_intent_id: intent.id,
        amount: intent.amount,
        currency: intent.currency
    };
}
