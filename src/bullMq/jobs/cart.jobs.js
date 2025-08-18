import redisClient from "../../utils/redisClient.js"
import { db } from "../../utils/db.js"
import { ApiError } from "../../utils/api-error.js";
import { userInfo } from "os";

/**
 * Idempotency & ordering strategy:
 * - We store a "cart_version" per user in Redis (monotonic).
 * - Each job carries that version.
 * - We UPDATE the DB only if `incomingVersion >= dbVersion`.
 */


const getCartVersion = async(userId) =>{
    const cart_key = `cart:user:${userId}`;

    const version = await redisClient.json.get(cart_key,"$.version");

    return version;
}


export const persistCartAdd = async({userId, bookId, quantity}) => {
    const version = await getCartVersion(userId);

    let cart = await db.cart.findUnique({
        where: { userId }
    });
    if (!cart) {
        cart = await db.cart.create({ data: { userId } });
    }

    // Skip outdated job (important for retries/out-of-order)
    if(cart.version > version){
        console.log(
            `[persistCartAdd] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`
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

    console.log(`[persistCartAdd] done for user ${userId} -> v${version}`);
}

export const persistCartRemove = async({ userId, bookId }) => {
    const version = await getCartVersion(userId);

    const cart = await db.cart.findUnique({ where: {userId }});

    // Skip outdated job (important for retries/out-of-order)
    if(cart.version > version){
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`);
        return;
    }

    await db.cartItem.delete({
        where: { cartId_bookId : {cartId: cart.id, bookId} }
    });

    console.log(`[persistCartRemove] done for user ${userId} -> v${version}`)
}


export const persistCartClear = async({ userId }) => {
    const version = await getCartVersion(userId);

    const cart = await db.cart.findUnique({ where: {userId }});

    // Skip outdated job (important for retries/out-of-order)
    if(cart.version > version){
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`);
        return;
    }

    await db.cartItem.deleteMany({
        where: { cartId : cart.id }
    });          

    console.log(`[persistCartClear] done for user ${userId} -> v${version}`)
}