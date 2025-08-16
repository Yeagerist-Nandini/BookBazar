// Implement: Add to cart, update quantity, remove item
import { ApiError } from "../utils/api-error";
import { db } from "../utils/db";
import redisClient, { redisPub } from '../utils/redisClient.js'
import fs from "fs";
import { getIO } from "./socketServer.js";
import { cartQueue } from "../bullMq/queues/cart.queue.js";

const CART_PREFIX = "cart:user:";
const CART_TOTAL_PREFIX = "cartTotal:user:";
export const CART_PUB_CHANNEL_PREFIX = 'cart:update:user:'; // publish to this channel for other services


const luaAddItem = fs.readFileSync("src/lua/updateCart.lua", "utf-8")



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







////////////////////////////////////////check what to return in all controllers 
// If it’s the first time the user has ever tried to view their cart, Redis simply won’t have any key like cart:items:user:{userId}.

const getCartItemsRedis = async (userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;
    const cartItems = await redisClient.hGetAll(cart_key);

    const bookIds = [...new Set(
        Object.keys(cartItems).map(f => f.split(':')[1])
    )];

    const itemsArray = [];

    for (let id of bookIds) {
        itemsArray.push({
            bookId: id,
            quantity: parseInt(cartItems[`book:${id}:qty`], 10),
            price: parseFloat(cartItems[`book:${id}:price`]),
            name: cartItems[`book:${id}:name`]
        })
    }

    return itemsArray;
}

const getTotalAmount = async (userId) => {
    const cart_total_key = `${CART_TOTAL_PREFIX}${userId}`;

    let totalAmount = await redisClient.get(cart_total_key);

    if (!totalAmount) {
        await updateTotalAmount(userId);
        totalAmount = await redisClient.get(cart_total_key);
    }

    return totalAmount;
}

const updateTotalAmount = async (userId) => {
    const cart_total_key = `${CART_TOTAL_PREFIX}${userId}`;
    const cart_key = `${CART_PREFIX}${userId}`;

    const cartItems = await redisClient.hGetAll(cart_key);

    let totalAmount = 0;
    for (let item in cartItems) {
        if (item.endsWith('qty')) {
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


const refreshCache = async (userId) => {
    const cart = await db.cart.findUnique({
        where: { userId },
        include: {
            cartItems: {
                book: true
            }
        }
    });
    if (!cart) await db.cart.create({ data: { userId } });

    const redisItems = {};

    cart.cartItems.forEach(({ book, quantity }) => {
        redisItems[`book:${book.id}:qty`] = quantity;
        redisItems[`book:${book.id}:price`] = book.price;
        redisItems[`book:${book.id}:name`] = book.title;
    });

    const cart_key = `${CART_PREFIX}${userId}`;
    await redisClient.hSet(cart_key, redisItems);

    return true;
}

const checkRedis = async (userId) => {
    const cart_key = `${CART_PREFIX}${userId}`;
    const cartItems = await redisClient.hGetAll(cart_key);

    if (!cartItems) return false;
    return true;
}



const updateCartDB = async (userId, book) => {
    let cart = await db.cart.findUnique({
        where: { userId }
    });
    if (!cart) {
        cart = await db.cart.create({ data: { userId } });
    }

    const cartId = cart.id;

    const cartItem = await db.cartItem.upsert({
        where: { cartId_bookId: { cartId, bookId: book.id } },
        update: { quantity: book.quantity },
        create: {
            cartId,
            bookId: book.id,
            quantity: book.quantity
        }
    });
    if (!cartItem) throw new ApiError(500, "Error while adding item to cart");
}


export const getCart = async (userId) => {
    //check if cart data is in redis 
    const cacheDataExists = await checkRedis(userId);

    if (!cacheDataExists) {
        await refreshCache(userId);
    }

    // if not in cache, fetch from db
    const cartItems = await getCartItemsRedis(userId);
    const totalAmount = await getTotalAmount(userId);

    return { cart: cartItems, totalAmount: totalAmount };
}

export const removeCartItem = async () => {
    //delete cartItem

    ////fetch new info in cache

    // get total cart amount 

    // return updated cart
}

export const clearCart = async () => {
    //delete cart

    // delete redis cache 
}

//Product removed from DB since last cart load → delete it from cart.