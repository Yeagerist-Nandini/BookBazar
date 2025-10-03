import fs from "fs";
import { ApiError } from "../utils/api-error.js";
import { db } from "../utils/db.js";
import redisClient from "../utils/redisClient.js";

import { reservationQueue } from "../bullMq/queues/order.queue.js"

const CART_PREFIX = "cart:user:";
const RESERVATION_TTL = 15 * 60; //15 min 


export const createOrderService = async (userId) => {
    try {
        //1. Load cart from redis 
        const cart_key = `${CART_PREFIX}${userId}`;

        const redis_client = await redisClient();
        let cart_data = await redis_client.json.get(cart_key);
        cart_data = cart_data[0];

        if (!cart_data || Object.keys(cart).length === 0)
            throw new ApiError(400, 'Cart Empty');

        //2. extract cart items
        const items = Object.entries(cart_data)
            .filter(([key, val]) => key !== "version" && key !== "updatedAt" && key !== "totalAmount")
            .map(([bookId, data]) => (
                {
                    bookId,
                    quantity: data.quantity,
                    price: data.price,
                    title: data.title
                }
            ));

        if (items.length === 0) {
            throw new ApiError(400, 'Cart Empty');
        }

        //3. Validate stock and price from db
        const books = await db.book.findMany({
            where: { id: { in: items.map(i => i.bookId) } },
            select: {
                id: true,
                stock: true,
                price: true
            }
        });

        for (const item of items) {
            const book = books.find((b) => b.id === item.bookId);

            if (!book) {
                //TODO: automatically remove this item from cart if this book doesn't exist
                throw new ApiError(404, "book doesn't exist");
            }

            if (book.stock < item.quantity) {
                //TODO: update quantity in redis
                throw new ApiError(400, `book ${book.id} out of stock`);
            }

            if (book.price != item.price) {
                //TODO: update price in redis
                item.price = book.price;
            }
        }

        //4. create order
        const totalAmount = items.reduce((sum, item) => (
            sum + (item.price * item.quantity)
        ), 0);

        const order = await db.order.create({
            data: {
                userId,
                status: 'PENDING',
                totalAmount,
                orderItem: {
                    create: items.map((item) => ({
                        bookId: item.bookId,
                        quantity: item.quantity,
                        unit_price: item.price
                    }))
                }
            },
            include: { orderItem: true }
        });

        //5. Reserve stock via Lua script  and store reservation data + ttl in redis
        const stockKeys = items.map(item => `stock:${item.bookId}`);
        const luaArgs = items.map(item => item.quantity.toString());
        luaArgs.push(RESERVATION_TTL.toString());
        luaArgs.push(order.id);

        const luaScript = fs.readfileSync('src/lua/reserveStock.lua', 'utf-8');
        const result = await redis_client.eval(luaScript, {
            keys: stockKeys,
            arguments: luaArgs
        });

        if (result.substring(0, 18) === "INSUFFICIENT_STOCK") {
            const bookKey = result.split(':')[1]
            throw new ApiError(`Insufficient stock for ${bookKey}`);
        }

        // If order expires (if order didn't get placed in 15 mins)
        // we can enqueue a job which will check the order status after 15 mins 

        //6. update payment status -> pending
        await db.order.update({
            where: { id: order.id },
            data: { status: "PAYMENT_PENDING" }
        });

        //7. Enqueue reservation expiry job
        const jobOptions = {
            delay: RESERVATION_TTL * 1000,
            attempts: 3
        }

        const jobData = {
            orderId: order.id,
            userId
        }

        reservationQueue.add(
            "reservation:expire",
            jobData,
            jobOptions
        )

        //8. publish ws event
        const io = getIO();
        const eventPayload = {
            event: "order.created",
            userId,
            orderId: order.id,
            totalAmount,
            items,
            expiresAt: Date.now() + RESERVATION_TTL * 1000
        };

        io.to(`user:${userId}`).emit("order:update", eventPayload);

        return { orderId: order.id, totalAmount };
    } catch (error) {
        throw new ApiError(500, "Error while creating order", error);
    }
}


export const failOrder = async () => {

}