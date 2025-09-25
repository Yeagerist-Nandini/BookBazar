import { ApiError } from "../utils/api-error.js"
import { db } from "../utils/db.js"


export const createPaymentIntent = async({orderId, amount}) => {

}

export const initPaymentForOrder = async(orderId) => {
    const order = await db.order.findUnique({ where: {orderId} })

    if(!order) throw new ApiError(404, "Order not found");
    if(order.status !== "PAYMENT_PENDING") throw new ApiError(400, "Order not ready for payment");

    const intent = await createPaymentIntent({ orderId, amount: order.totalAmount});

    await db.payment.create({
        data: {
            orderId,
            status: "PENDING",
            transactionId: intent.payment_intent_id
        }
    });

    return {}
}