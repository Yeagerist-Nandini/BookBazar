// Implement: Add to cart, update quantity, remove item

import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import { db } from "../utils/db";


const updateOrderTotalAmount =  async(orderId) => {
    const items = await db.orderItem.findMany({
        where: {orderId}
    });

    const totalAmount  = items.reduce((sum, item) => (
        sum + item.unit_price * item.quantity
    ),0)

    const order = await db.order.update({
        where: { id: orderId},
        data: {totalAmount}
    });

    if(!order) throw new ApiError(500, "error while updating total amount")
}

const addItem = asyncHandler( async(req, res) => {
    const userId = req.user.id
    const { bookId, quantity, unit_price } = req.body;

    //check if there is an order
    let order = await db.order.findFirst({
        where: { 
            userId,
            status: "PENDING"
        }
    });

    if(!order){
        order = await db.order.create({
            data:{
                userId,
                totalAmount: 0,
                status: "PENDING"     
            }
        })

        if(!order) throw new ApiError(500, "Error while creating order")
    }

    //check if orderItem is already there
    let orderItem = await db.orderItem.findFirst({
        where: {
            orderId: order.id,
            bookId
        }
    });

    if(!orderItem){
        orderItem = await db.orderItem.create({
            data: {
                orderId: order.id,
                bookId,
                quantity,
                unit_price
            }
        })
    }
    else{
        const new_quantity = orderItem.quantity + quantity;
        orderItem = await db.orderItem.update({
            where : {
                orderId: order.id,
                bookId,
            },
            data:{
                quantity: new_quantity,
                unit_price
            }
        });
    }

    if(!orderItem) throw new ApiError(500, "Error while adding item to cart");
    
    await updateOrderTotalAmount(order.id)

    return res
           .status(200)
           .json(new ApiResponse(200, order, "Added Item to cart successfully!"))
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