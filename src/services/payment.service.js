import Stripe from "stripe"
import  fs from "fs";
import { ApiError } from "../utils/api-error.js"
import { db } from "../utils/db.js"
import dotenv from "dotenv"
import redisClient from "../utils/redisClient.js";
import { notifyQueue } from "../bullMq/queues/order.queue.js";

dotenv.config();


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET; // set in env from Stripe dashboard


/**
 * Create a Stripe Payment Intent for the given order.
 */
export const createPaymentIntent = async({orderId, idempotencyKey, userId}) => {
    //1. load order
    const order = await db.order.findUnique({ where: {orderId} });

    if (order.userId !== userId) throw new ApiError('Unauthorized');
    if(!order) throw new ApiError(404, "Order not found");
    if(order.status !== "PAYMENT_PENDING") throw new ApiError(400, `Order ${orderId} not payable (status=${order.status})`);

    //2. create payment intent 
    const amount = Math.round(order.totalAmount * 100);
    const currency = (process.env.PAYMENT_CURRENCY || "inr").toLowerCase();

    const params = {
        amount: Math.round(amount),
        currency,
        metadata: { orderId },
        automatic_payment_methods: {enabled: true},
    };

    const requestOptions = {};
    if (idempotencyKey) requestOptions.idempotencyKey = idempotencyKey;

    const intent = await stripe.paymentIntents.create(params, requestOptions);

    // 3. persist Payment row (idempotent create logic)
    // If a Payment entry already exists for this order with same transactionId -> skip create
    await db.order.update({
        where: { id: orderId },
        data: {
            status: 'PAYMENT_PENDING',
            paymentIntentId: intent.id
        }
    });
    
    const existing = await db.payment.findFirst({ where: { orderId, transactionId: intent.id} });
    if(!existing){
        await db.payment.create({
            data: {
                orderId,
                paymentStatus: "PENDING",
                transactionId: intent.id,
                amount: order.totalAmount,
                currency: "INR"
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


/**
 * Handle Stripe Webhook events (payment success/failure).
 */

export const handleWebhook = async(sig, body) => {
    let event;

    //1. verify stripe signature
    try {
        event = stripe.webhooks.constructEvent(
            body, 
            sig, 
            webhookSecret
        );
    } catch (error) {
        console.error("Webhook signature verification failed", err);
        throw new ApiError(400, "Invalid signature");
    }

    //2. Handle event types
    switch(event.type){
        case "payment_intent.succeeded": {
            const intent = event.data.object;
            const orderId = intent.metadata.orderId;

            console.log(`Payment succeeded for Order ${orderId}`);

            handleSuccesfullPayment(orderId);

            break;
        }

        case "payment_intent.payment_failed": {
            const intent = event.data.object;
            const orderId = intent.metadata.orderId;

            console.log(`Payment failed for Order ${orderId}`);

            handleFailedPayment(orderId);

            break;
        }

        default: 
        console.log(`Unhandled event type ${event.type}`);
    }
}


const handleSuccesfullPayment = async(orderId) => {
    //1. fetch order
    const order = await db.order.findUnique({
        where: {id: orderId},
        include: {payment: true},
    });

    //2. If already processed -> idempotent noop
    if(order.payment.paymentStatus === "SUCCESS"){
        console.log(`Order ${orderId} already marked as SUCCESS`);
        return;
    }

    //3. update payment and order 
    await db.$transaction(async(tx) => {
        await tx.order.update({ where:{ id: orderId }, data: { status: "CONFIRMED" }});
        await tx.payment.update({ where: {id: order.payment.id }, data: { paymentStatus: "SUCCESS" }});
    });

    //4. Finalize stock reservation
    const redis_client = await redisClient();
    const keyExists = redis_client.exists(`resv:${orderId}`);

    if(keyExists){
        await redis_client.del(`resv:${orderId}`);
    }

    //5. enqueue notification job
    await notifyQueue.add(
        'notify', 
        { orderId, type: 'order:paid' },
        { removeOnComplete: true, removeOnFail: false }
    );

    //6. publish WS event
    orderEventsPublisher.publish(order.userId, 'order.paid', {
        orderId,
        totalAmount: order.totalAmount,
    });

    return 'done';
}

const handleFailedPayment = async(orderId) => {
    //1. fetch order
    const order = await db.order.findUnique({
        where: {id: orderId},
        include: {payment: true},
    });

    const transactionId = order.paymentIntentId;
    
    if (!order.payment) {
        console.warn(`[handlePaymentFailed] payment not found ${transactionId}`);
        return;
    }

    //2. idempotent: multiple reqs 
    if(order.payment.paymentStatus === "FAILED"){
        console.log(`Order ${orderId} already marked as FAILED`);
        return;
    }

    //3. mark payment failed and order cancelled
    await db.$transaction(async(tx) => {
        await tx.payment.update({where: { id: order.payment.id }, data: { paymentStatus: "FAILED" }});
        await tx.order.update({where: { id: order.id }, data: { status: "CANCELLED" }});
    });

    //4. Release stock
    const redis_client = await redisClient();

    const releaseStockScript = fs.readFileSync('src/lua/releaseReservation.lua', 'utf-8');
    await redis_client.eval({
        releaseStockScript,
        keys: [`resv:${orderId}`],
        arguments: [orderId]
    });
    
    //5. enqueue notification job
    await notifyQueue.add(
        'notify', 
        { orderId, type: 'order:payment:failed' },
        { removeOnComplete: true, removeOnFail: false }
    );

    //6. Publish WS event 
    orderEventsPublisher.publish(order.userId, 'order:payment_failed', {
        orderId,
    });

    return 'done';
}

