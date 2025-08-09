// Implement: Add to cart, update quantity, remove item

import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import { db } from "../utils/db";
import redisClient from '../utils/redisClient.js'


const CART_PREFIX = "cart:userId:";
const CART_TOTAL_PREFIX = "cartTotal:userId:";



const updateTotalAmount =  async(userId, cartId) => {
    const cart_total_prefix = `${CART_TOTAL_PREFIX}${userId}`;
    let totalAmount = await redisClient.get(cart_total_prefix);

    if(totalAmount) return parseFloat(totalAmount);
    
    ///if not in cache
    const items = await db.cartItem.findMany({
        where: {cartId},
        include: { book: true }
    });

    totalAmount  = items.reduce((sum, item) => (
        sum + (item.book.unit_price * item.quantity)
    ),0)

    // Store with TTL (5 min)
    await redisClient.setEx(cart_total_prefix, 300, totalAmount.toString());

    const cart = await db.cart.update({
        where: { id: cartId},
        data: {totalAmount}
    });

    if(!cart) throw new ApiError(500, "error while updating total amount")

    return cart;
}


// add or update an item in cart
export const addItemToCart = async(userId, bookId, quantity) => {
    let cart = await db.cart.findUnique({
        where: {userId}
    });
    if(!cart){
        cart = await db.cart.create({ data: {userId} });
    }

    const cart_key = `${CART_PREFIX}${userId}`;
    await redisClient.hSet(cart_key,bookId, quantity.toString());

    const cartId = cart.id;

    const cartItem = await db.cartItem.upsert({
        where: { cartId_bookId: { cartId, bookId }},
        update: { quantity },
        create: { 
            cartId, 
            bookId, 
            quantity
        }
    });

    if(!cartItem) throw new ApiError(500, "Error while adding item to cart");

    cart = await updateTotalAmount(userId, cartId);

    return cart;
}

export const getCart = async(userId) => {
    //check if cart data is in redis 
    const cart_key = `${CART_PREFIX}${userId}`;
    let cartData = await redisClient.hGetAll(cart_key);

    // if in cache, return the data
    if(cartData){
        return 0;
    }

    // if not in cache, fetch from db
    const cart = await db.cart.findMany({
        where: {userId},
        include: { 
            cartItems:{
                book: true
            }
        }
    });

    if(!cart) throw new ApiError(404, "cart not found");

    // store in cache

    return cart;
}

export const removeCartItem = async() => {

}

export const clearCart = async() => {
    
}