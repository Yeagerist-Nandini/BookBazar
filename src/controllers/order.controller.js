import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import { db } from "../utils/db";
import { updateOrderStatus, createOrder } from "../services/order.service.js"

//first cart -> checkout -> create order -> payment
// if payment failed -> then order status cancelled
// else -> then order confirmed

//TODO: validation
export const createOrder = asyncHandler(async(req, res) => {
    const { userId } = req.user;
    
    const order = await createOrder(userId, req.body);

    return res
            .status(200)
            .json(new ApiResponse(200, order, "Order created successfully!"))
});


export const getUserOrders = asyncHandler(async(req, res) => {
    const userId = req.user.id;

    const orders = await db.order.findMany({
        where: {userId},
        include: {
            orderItem: {
                include: {
                    book: true
                }
            }
        }
    });

    if(!orders) throw new ApiError(404, "Order not found");
    
    return res
            .status(200)
            .json(new ApiResponse(200, orders, "fetched orders successfully!"))
});

export const getOrderById = asyncHandler(async(req, res) => {
    const userId  = req.user.id;
    const { orderId } = req.params;

    const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
            orderItems: {
                include: { book: true }
            }
        }
    });

    if(!order) throw new ApiError(404, "Order not found");

    return res
            .status(200)
            .json(new ApiResponse(200, order, "Order fetched successfully!"))
});

export const cancelOrder = asyncHandler(async(req, res) => {
    const { orderId } = req.params;

    let order = await db.order.findUnique({
        where: {id: orderId}
    });
    if(!order) throw new ApiError(404, "Order not found");

    if(order.status != "PENDING") throw new ApiError(400, "Order can't be cancelled");

    order = await db.order.update({
        where: { id: orderId },
        date: { status: "CANCELLED" }
    });
});

export const getOrdersAdmin = asyncHandler(async(req, res) => {
    const orders = await db.order.findMany({});

    return res
            .status(200)
            .json(new ApiResponse(200, orders, "Orders fetched successfully"))
});


export const updateOrderStatusAdmin = asyncHandler(async(req, res) => {
    const {orderId} = req.params;
    const { status } = req.body;

    const order = await updateOrderStatus(orderId, status);

    //TODO: send mail to user after order status updation
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} successfull`))
});

// Payment success
export const paymentSuccess = asyncHandler(async (req, res) => {
    const {orderId} = req.params;

    const order = await updateOrderStatus(orderId, "CONFIRMED");

    //TODO: send mail to user after order status updation
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} successfull`))
});

// Payment failed
export const paymentFailed = asyncHandler(async (req, res) => {
    const {orderId} = req.params;

    const order = await updateOrderStatus(orderId, "CANCELLED");
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} failed`))
});