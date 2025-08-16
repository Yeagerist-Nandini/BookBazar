import redisClient from "../../utils/redisClient.js"
import { db } from "../../utils/db.js"
import { ApiError } from "../../utils/api-error.js";

/**
 * Idempotency & ordering strategy:
 * - We store a "cart_version" per user in Redis (monotonic).
 * - Each job carries that version.
 * - We UPDATE the DB only if `incomingVersion >= dbVersion`.
 */


export const persistCart = async({userId, bookId, quantity}) => {
    const cart_key = `cart:user:${userId}`;
    
    const version = await redisClient.json.get(cart_key, "$.version");

    let cart = await db.cart.findUnique({
        where: { userId }
    });
    if (!cart) {
        cart = await db.cart.create({ data: { userId } });
    }

    // Skip outdated job (important for retries/out-of-order)
    if(cart.version > version){
        console.log(
            `[persistCart] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`
        );
        return;
    }

    const cartItem = await db.upsert({
        where: { cartId_bookId: { cartId: cart.id, bookId} },
        update: { quantity: book.quantity },
        create: {
            cartId: cart.id,
            bookId,
            quantity
        }
    });

    if (!cartItem) throw new ApiError(500, "Error while adding item to cart");

    console.log(`[persistCart] done for user ${userId} -> v${version}`);
}