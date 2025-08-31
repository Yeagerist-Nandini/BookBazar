import express from "express";
import {
    addToCart,
    removeFromCart,
    getCart,
    clearCart
}  from "../controllers/cart.controller.js";

const router = express.Router();

router.post('/cart/add', addToCart);
router.post('/cart/remove', removeFromCart);
router.get('/cart', getCart);
router.delete('/cart/clear', clearCart);

export default router;