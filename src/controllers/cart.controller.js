import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import * as cartService from '../services/cart.service.js'


export const addToCart  = asyncHandler( async(req, res) => {
    const userId = req.user.id
    const { bookId, quantity } = req.body;

    const latest_cart = await cartService.addItemToCart(userId, cart.cartId, bookId, quantity);

    return res
           .status(200)
           .json(new ApiResponse(200, latest_cart, "Added Item to cart successfully!"))
})

export const removeFromCart = asyncHandler( async(req, res) => {
    const userId = req.user.id
    const { bookId } = req.body;

    const cart = await cartService.removeCartItem(userId, bookId);
   
    return res
           .status(200)
           .json(new ApiResponse(200, cart, "Deleted Item successfully!"))
})

export const getCart = asyncHandler( async(req, res) => {
    const userId = req.user.id

    const cart = await cartService.getCart(userId);
   
    return res
           .status(200)
           .json(new ApiResponse(200, cart, "Fetch cart successfully"))
})

export const clearCart = asyncHandler( async(req, res) => {
    const userId = req.user.id;

    await cartService.clearCart(userId);

    return res.status(200).json(new ApiResponse(200, {}, "Cart cleared"));
})
