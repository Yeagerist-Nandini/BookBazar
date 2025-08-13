// Implement: Add to cart, update quantity, remove item
import { ApiError } from "../utils/api-error";
import { db } from "../utils/db";
import redisClient from '../utils/redisClient.js'
import fs from "fs";

const CART_PREFIX = "cart:user:";
const CART_TOTAL_PREFIX = "cartTotal:user:";

const luaAddItem = fs.readFileSync("src/lua/updateCart.lua", "utf-8")

// const updateTotalAmount =  async(userId, cartId) => {
//     const cart_total_prefix = `${CART_TOTAL_PREFIX}${userId}`;
//     let totalAmount = await redisClient.get(cart_total_prefix);

//     if(totalAmount) return parseFloat(totalAmount);
    
//     ///if not in cache
//     const items = await db.cartItem.findMany({
//         where: {cartId},
//         include: { book: true }
//     });

//     totalAmount  = items.reduce((sum, item) => (
//         sum + (item.book.unit_price * item.quantity)
//     ),0)

//     // Store with TTL (5 min)
//     await redisClient.setEx(cart_total_prefix, 300, totalAmount.toString());

//     const cart = await db.cart.update({
//         where: { id: cartId},
//         data: {totalAmount}
//     });

//     if(!cart) throw new ApiError(500, "error while updating total amount")

//     return cart;
// }



////////////////////////////////////////check what to return in all controllers 
// If it’s the first time the user has ever tried to view their cart, Redis simply won’t have any key like cart:items:user:{userId}.

const getCartItemsRedis = async(userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;
    const cartItems = await redisClient.hGetAll(cart_key);

    const bookIds = [...new Set(
        Object.keys(cartItems).map(f => f.split(':')[1])
    )];

    const itemsArray = [];

    for(let id of bookIds){
        itemsArray.push({
            bookId: id,
            quantity: parseInt(cartItems[`book:${id}:qty`], 10),
            price: parseFloat(cartItems[`book:${id}:price`]),
            name: cartItems[`book:${id}:name`]
        })
    }

    return itemsArray;
}

const getTotalAmount = async(userId) => {
    const cart_total_key = `${CART_TOTAL_PREFIX}${userId}`;

    let totalAmount = await redisClient.get(cart_total_key);

    if(!totalAmount){
        await updateTotalAmount(userId);
        totalAmount = await redisClient.get(cart_total_key);
    }
    
    return totalAmount;
}

const updateTotalAmount =  async(userId) => { 
    const cart_total_key = `${CART_TOTAL_PREFIX}${userId}`;
    const cart_key = `${CART_PREFIX}${userId}`;

    const cartItems = await redisClient.hGetAll(cart_key);

    let totalAmount = 0;
    for(let item in cartItems){
        if(item.endsWith('qty')){
            const bookId = item.split(':')[1];
            const qty = parseInt(cartItems[`book:${bookId}:qty`], 10);
            const price = parseFloat(cartItems[`book:${bookId}:price`]);

            totalAmount += (qty * price);
        }
    }

    // Store with TTL (5 min)
    await redisClient.setEx(cart_total_key, 300, totalAmount.toString());
   //await client.expire('mykey', 10);
}


const refreshCache = async(userId) => {
    const cart = await db.cart.findUnique({
        where: {userId},
        include: { 
            cartItems:{
                book: true
            }
        }
    });
    if(!cart) await db.cart.create({ data: {userId} });

    const redisItems = {};

    cart.cartItems.forEach(({book, quantity}) => {
        redisItems[`book:${book.id}:qty`] = quantity;
        redisItems[`book:${book.id}:price`] =  book.price;
        redisItems[`book:${book.id}:name`] =  book.title;
    });

    const cart_key = `${CART_PREFIX}${userId}`;
    await redisClient.hSet(cart_key, redisItems);

    return true;
}

const checkRedis = async(userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;
    const cartItems = await redisClient.hGetAll(cart_key);

    if(!cartItems) return false;
    return true;
}



const updateCartDB = async(userId, book) => {
    let cart = await db.cart.findUnique({
        where: {userId}
    });
    if(!cart){
        cart = await db.cart.create({ data: {userId} });
    }

    const cartId = cart.id;

    const cartItem = await db.cartItem.upsert({
        where: { cartId_bookId: { cartId, bookId:book.id }},
        update: { quantity: book.quantity },
        create: { 
            cartId, 
            bookId: book.id, 
            quantity: book.quantity
        }
    });
    if(!cartItem) throw new ApiError(500, "Error while adding item to cart");
}


export const getCart = async(userId) => {
    //check if cart data is in redis 
    const cacheDataExists = await checkRedis(userId);

    if(!cacheDataExists){
        await refreshCache(userId);
    }

    // if not in cache, fetch from db
    const cartItems = await getCartItemsRedis(userId);
    const totalAmount = await getTotalAmount(userId);

    return {cart: cartItems, totalAmount: totalAmount };
}

export const removeCartItem = async() => {
    //delete cartItem

    ////fetch new info in cache

    // get total cart amount 

    // return updated cart
}

export const clearCart = async() => {
    //delete cart

    // delete redis cache 
}


///TODO: validate through zod
// bookId, quantity
// if(!bookDetails.quantity || bookDetails.quantity <= 0){
//     throw new ApiError(400, "Invalid Request");
// }

const getValidQuantity = (book, quantity) => {
    //product should be in stock 
    if(quantity > book.stock){
        quantity = book.stock;
    }

    // max qty should be 10 for each product
    if(quantity > 10){
        quantity = Math.min(book.stock, 10);
    }

    return quantity;
}

export const addItemToCart = async(userId, bookId, quantity) => {
    //check if book exists
    const book = await db.book.findUnique({where: {id: bookId}});
    if(!book) throw new ApiError(400, "Invalid Request");

    quantity = getValidQuantity(book, quantity);

    // upsert cart in redis
    const cart_key = `${CART_PREFIX}${userId}`;
    await redisClient.eval(luaAddItem, {
        keys: [cart_key],
        arguments: [
            bookId,
            quantity,
            book.price,
            book.title,
            Date.now()
        ]
    });

    // publish update to websocket + redis pub/sub

    // push cart persist job in queue


}




//Product removed from DB since last cart load → delete it from cart.