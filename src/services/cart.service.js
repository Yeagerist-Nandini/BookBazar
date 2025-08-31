// Implement: Add to cart, update quantity, remove item
import { ApiError } from "../utils/api-error.js";
import { db } from "../utils/db.js";
import redisClient, { redisPub, redisSub } from '../utils/redisClient.js'
import fs from "fs";
import { getIO } from "./socketServer.js";
import { cartQueue } from "../bullMq/queues/cart.queue.js";

const CART_PREFIX = "cart:user:";

export const CART_PUB_CHANNEL_PREFIX = 'cart:update:user:'; // publish to this channel for other services


const luaAddItem = fs.readFileSync("src/lua/updateCart.lua", "utf-8")
const luaDeleteItem = fs.readFileSync("src/lua/deleteCartItem.lua", "utf-8")
const luaClearCart = fs.readFileSync("src/lua/clearCart.lua", "utf-8")


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

        console.log('-----------got books');

        //2. upsert cart in redis
        const redis_client = await redisClient();

        const cart_key = `${CART_PREFIX}${userId}`;
        const ts = Date.now().toString();

        const result = await redis_client.eval(luaAddItem, {
            keys: [cart_key],
            arguments: [
                bookId,
                quantity.toString(),
                book.price.toString(),
                book.title,
                ts
            ]
        });

        if(result !== "UPDATED") throw new ApiError(500, "error while adding item in cart")
          
        console.log('-----------added item in redis');


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

        const pubClient = await redisPub();
        await pubClient.publish(pubChannel, JSON.stringify(pubPayload));

        console.log('-----------add item redis pub sub');

        //4. optionally emit directly to THIS connection for faster response (use socket.io room)
        const io = getIO();
        io.to(`user:${userId}`).emit('cart:update', pubPayload);

        console.log('-----------add item redis pub sub io');


        //5. push cart persist job in queue
        const data = {
            action: "add",
            userId,
            bookId,
            quantity
        }

        const jobOptions = {
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

        console.log('-----------pushed add item job in queue');

        return pubPayload;
    } catch (error) {
        console.error(error);
    }
}


export const getCart = async (userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;

    const redis_client = await redisClient();
    const cart = await redis_client.json.get(cart_key);
    console.log(cart);

    return cart;
}


export const removeCartItem = async (userId, bookId) => {
    try {
        //1. check if book exists
        const book = await db.book.findUnique({ where: { id: bookId } });
        if (!book) throw new ApiError(404, "Book not found");

        console.log("-----------got books");

        //2. delete it from redis
        const cart_key = `${CART_PREFIX}${userId}`;
        const ts = Date.now().toString();

        const redis_client = await redisClient();
        const res = await redis_client.eval(luaDeleteItem, {
            keys: [cart_key],
            arguments: [
                bookId,
                ts
            ]
        })
        if (res === "NO_CART" || res === "NOT_FOUND" || res === "ITEM_NOT_FOUND") {
            throw new ApiError(400, "Invalid request");
        }

        console.log('-----------removed item from redis');

        //3. update user via ws and pub/sub
        const pubChannel = `${CART_PUB_CHANNEL_PREFIX}${userId}`;
        const pubPayload = {
            event: 'cart:item_deleted',
            userId,
            bookId,
            updatedAt: ts
        };

        const pubClient = await redisPub();
        await pubClient.publish(pubChannel, JSON.stringify(pubPayload));

        console.log('-----------add item redis pub sub');

        //4. optionally emit directly to THIS connection for faster response (use socket.io room)
        const io = getIO();
        io.to(`user:${userId}`).emit('cart:update', pubPayload);

        console.log('-----------add item redis pub sub io');

        //5. update DB via mqs
        const data = {
            action: "remove",
            userId,
            bookId
        }

        const jobOptions = {
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

        console.log('-----------pushed add item job in queue');

        return pubPayload
    } catch (error) {
        console.error(error);
    }
}


export const clearCart = async (userId) => {
    try {
        //1. clear redis cart via lua 
        const cart_key = `${CART_PREFIX}${userId}`;
        const ts = Date.now().toString();

        const client = await redisClient();
        const res = await client.eval(luaClearCart, {
            keys: [cart_key],
            arguments: [ ts ]
        });

        console.log('-----------clear cart in redis');

        if (res === "NO_CART") {
            console.log(`[clearCart] No cart exists for user ${userId}`);
            return;
        }          

        //update via pub-sub 
        const pubChannel = `${CART_PUB_CHANNEL_PREFIX}${userId}`;
        const pubPayload = {
            event: 'cart:cleared',
            userId,
            updatedAt: ts
        };

        const pubClient = await redisPub();
        await pubClient.publish(pubChannel, JSON.stringify(pubPayload));

        console.log('-----------clear cart redis pub sub');

        //emit directly to this connection for faster response
        const io = getIO();
        io.to(`user:${userId}`).emit('cart:update', pubPayload);

        console.log('-----------clear cart redis pub sub io');

        //clear cart using mq
        const data = {
            action: "clear",
            userId
        }

        const jobOptions = {
            attempts: 10,
            backoff: { type: "exponential", delay: 1000 },
            priority: 1,
            removeOnComplete: { age: 2*60*60, count: 5000 },
            removeOnFail: { age: 24*60*60 }
        }

        await cartQueue.add(
            "persistCart",
            data,
            jobOptions
        );

        console.log('-----------pushed clear cart job in queue');

        return pubPayload
    } catch (error) {
        console.error(error);
    }
}


//check what to return in all controllers 
// If it’s the first time the user has ever tried to view their cart, Redis simply won’t have any key like cart:items:user:{userId}.

