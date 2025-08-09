// Implement: Add to cart, update quantity, remove item

import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import { db } from "../utils/db";
import * as cartService from '../services/cart.service.js'


export const addItem = asyncHandler( async(req, res) => {
    const userId = req.user.id
    const { bookId, quantity } = req.body;

    if(quantity == 0) delete cartItem;

    const latest_cart = await cartService.addItemToCart(userId, cart.cartId, bookId, quantity);

    return res
           .status(200)
           .json(new ApiResponse(200, latest_cart, "Added Item to cart successfully!"))
})

const deleteItem = asyncHandler( async(req, res) => {
    const userId = req.user.id
    const { bookId } = req.body;

    const order = await db.order.findFirst({
        where: {userId, status: "PENDING"}
    });
    if (!order) throw new ApiError(404, "No active cart found");
    
    const orderItem = await db.orderItem.delete({
        where: {
            orderId: order.id,
            bookId
        }
    });
    if(!orderItem) throw new ApiError(500, "error while deleting item");


    const remainingItems = await db.orderItem.count({
        where: {orderId: order.id}
    });

    if(remainingItems === 0){
        await db.order.delete({
            where: {id: order.id}
        });

        return res
           .status(200)
           .json(new ApiResponse(200, null, "Deleted Item successfully!"))
    }

    // Update totalAmount if order still has items
    await db.order.update({
        where: { id: order.id },
        data: {
            totalAmount: order.totalAmount - (orderItem.quantity * orderItem.unit_price)
        }
    });

    return res
           .status(200)
           .json(new ApiResponse(200, order, "Deleted Item successfully!"))
})

const viewCart = asyncHandler( async(req, res) => {

})

const updateCartItem = asyncHandler( async(req, res) => {

})

const checkout = asyncHandler( async(req, res) => {

})