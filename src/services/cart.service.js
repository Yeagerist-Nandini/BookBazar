// Implement: Add to cart, update quantity, remove item
import { ApiError } from "../utils/api-error";
import { db } from "../utils/db";
import redisClient, { redisPub } from '../utils/redisClient.js'
import fs from "fs";
import { getIO } from "./socketServer.js";
import { cartQueue } from "../bullMq/queues/cart.queue.js";
import { tryCatch } from "bullmq";

const CART_PREFIX = "cart:user:";

export const CART_PUB_CHANNEL_PREFIX = 'cart:update:user:'; // publish to this channel for other services


const luaAddItem = fs.readFileSync("src/lua/updateCart.lua", "utf-8")

const luaDeleteItem = fs.readFileSync("src/lua/deleteCartItem.lua", "utf-8")


const getValidQuantity = (book, quantity) => {
    //product should be in stock 
    if (quantity > book.stock) {
        quantity = book.stock;
    }

    // max qty should be 10 for each product
    if (quantity > 10) {
        quantity = Math.min(book.stock, 10);
    }

    return quantity;
}


///TODO: validate through zod
// bookId, quantity
// if(!bookDetails.quantity || bookDetails.quantity <= 0){
//     throw new ApiError(400, "Invalid Request");
// }
export const addItemToCart = async (userId, bookId, quantity) => {
    try {
        //1. check if book exists
        const book = await db.book.findUnique({ where: { id: bookId } });
        if (!book) throw new ApiError(400, "Invalid Request");

        quantity = getValidQuantity(book, quantity);

        //2. upsert cart in redis
        const cart_key = `${CART_PREFIX}${userId}`;
        const ts = Date.now().toString();

        await redisClient.eval(luaAddItem, {
            keys: [cart_key],
            arguments: [
                bookId,
                quantity,
                book.price,
                book.title,
                ts
            ]
        });


        //3. publish cart updates to Redis pub/sub channel for this user
        const pubChannel = `${CART_PUB_CHANNEL_PREFIX}${userId}`;
        const pubPayload = {
            event: 'cart:item_updated',
            userId,
            bookId,
            quantity,
            price: book.price,
            title: book.title,
            updatedAt: ts
        }
        await redisPub.publish(pubChannel, JSON.stringify(pubPayload));

        //4. optionally emit directly to THIS connection for faster response (use socket.io room)
        const io = getIO();
        io.to(`user:${userId}`).emit('cart:update', pubPayload);


        //5. push cart persist job in queue
        const data = {
            action: "add",
            userId,
            bookId,
            quantity
        }

        const jobOptions = {
            jobId: `persistCart:${userId}:`,
            attempts: 10,
            backoff: { type: "exponential", delay: 1000 },
            priority: 1,              // critical
            removeOnComplete: { age: 2 * 60 * 60, count: 5000 },
            removeOnFail: { age: 24 * 60 * 60 },
            // optional delay if you want burst-collapsing:
            // delay: 150, // small debounce to collapse rapid edits
            // timeout: 45_000,
        }

        await cartQueue.add(
            "persistCart",
            data,
            jobOptions
        )

    } catch (error) {
        console.error(error);
    }
}


export const getCart = async (userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;

    const cart = await redisClient.json.get(cart_key);
    console.log(cart);

    return cart;
}


export const removeCartItem = async (userId, bookId) => {
    try {
        //1. check if book exists
        const book = await db.findUnique({ where: { id: bookId } });
        if (!book) throw new ApiError(404, "Book not found");

        //2. delete it from redis
        const cart_key = `${CART_PREFIX}${userId}`;
        const ts = Date.now().toString();

        const res = await redisClient.eval(luaDeleteItem, {
            keys: [cart_key],
            arguments: [
                bookId,
                ts
            ]
        })
        if (res === "NO_CART" || res === "NOT_FOUND" || res === "ITEM_NOT_FOUND") {
            throw new ApiError(400, "Invalid request");
        }

        //get redis '$.totalAmount' by doing getTotalAmount()

        //3. update user via ws and pub/sub
        const pubChannel = `${CART_PUB_CHANNEL_PREFIX}${userId}`;
        const pubPayload = {
            event: 'cart:item_deleted',
            userId,
            bookId,
            updatedAt: ts
        };

        await redisPub.publish(pubChannel, JSON.stringify(pubPayload));

        //4. optionally emit directly to THIS connection for faster response (use socket.io room)
        const io = getIO();
        io.to(`user${userId}`).emit('cart:update', pubPayload);

        //5. update DB via mqs
        const data = {
            action: "remove",
            userId,
            bookId
        }

        const jobOptions = {
            jobId: `persistCart:${userId}`,
            attempts: 10,
            backoff: { type: "exponential", delay: 1000 },
            priority: 1,
            removeOnComplete: { age: 2 * 60 * 60, count: 5000 },
            removeOnFail: { age: 24 * 60 * 60 }
        }

        await cartQueue.add(
            "persistCart",
            data,
            jobOptions
        )
    } catch (error) {
        console.error(error);
    }
}


export const clearCart = async () => {
    //delete cart

    // delete redis cache 
}


////////////////////////////////////////check what to return in all controllers 
// If it’s the first time the user has ever tried to view their cart, Redis simply won’t have any key like cart:items:user:{userId}.



//Product removed from DB since last cart load → delete it from cart.