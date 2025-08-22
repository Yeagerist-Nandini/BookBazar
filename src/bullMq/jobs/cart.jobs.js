import redisClient from "../../utils/redisClient.js"
import { db } from "../../utils/db.js"
import { ApiError } from "../../utils/api-error.js";

/**
 * Idempotency & ordering strategy:
 * - We store a "cart_version" per user in Redis (monotonic).
 * - Each job carries that version.
 * - We UPDATE the DB only if `incomingVersion >= dbVersion`.
 * Skip outdated job (important for retries/out-of-order)
 */


const getCartVersion = async (userId) => {
    const cart_key = `cart:user:${userId}`;

    const version = await redisClient.json.get(cart_key, "$.version");

    return version;
}


const fullCartSync = async (userId, version) => {
    const cart_key = `cart:user:${userId}`;
    const redisCart = await redisClient.json.get(cart_key, "$");

    // if no item in redis cart
    if (!redisCart || redisCart.length === 0) {
        const cart = await db.cart.findUnique({ where: { userId } });

        if (cart) {
            await db.$transaction([ 
                db.cartItem.deleteMany({
                    where: { cartId: cart.id }
                }),
                db.cart.update({
                    where: { id: cart.id },
                    data: { version }
                })
            ]);
        }
        console.log(`[fullCartSync] Cleared DB cart for user ${userId} -> v${version}`);
        return;
    }
    
    // redis returns array 
    const snapshot = redisCart[0]; // JSON.GET "$" returns array
    const {version, totalAmount, updatedAt, ...items} = snapshot;

    await db.$transaction(async (tx) => {
        //upsert cart
        const cart = await tx.cart.upsert({
            where: { userId },
            update: { version },
            create: { userId, version }
        });

        // remove existing items 
        await tx.cartItem.deleteMany({ where: { cartId: cart.id }});

        //recreate cart items 
        const cartItems = Object.entries(items).map(([bookId, item]) => ({
            cartId: cart.id,
            bookId: bookId,
            quantity: item.quantity,
        }));

        if(cartItems.length > 0){
            await tx.cartItem.createMany({ data: cartItems });
        }
    });
    
    console.log(`[fullCartSync] user ${userId} synced from Redis -> v${version}`); 
}

export const persistCartAdd = async ({ userId, bookId, quantity }) => {
    const redisVersion = await getCartVersion(userId);

    let cart = await db.cart.findUnique({
        where: { userId }
    });
    if (!cart) {
        cart = await db.cart.create({ data: { userId, version: 0 } });
    }

    // Skip outdated job (important for retries/out-of-order)
    if (cart.version > redisVersion) {
        console.log(
            `[persistCartAdd] Skip outdated job for user ${userId}: incoming v${redisVersion} < DB v${cart.version}`
        );
        return;
    }

    if (cart.version !== redisVersion - 1) {
        // Out of sync → full sync
        await fullCartSync(userId, redisVersion);
        return
    }

    const cartItem = await db.upsert({
        where: { cartId_bookId: { cartId: cart.id, bookId } },
        update: { quantity: book.quantity },
        create: {
            cartId: cart.id,
            bookId,
            quantity
        }
    });

    if (!cartItem) throw new ApiError(500, "Error while adding item to cart");


    await db.cart.update({
        where: { id: cart.id },
        data: { version: redisVersion }
    });

    console.log(`[persistCartAdd] done for user ${userId} -> v${redisVersion}`);
}


export const persistCartRemove = async ({ userId, bookId }) => {
    const redisVersion = await getCartVersion(userId);

    const cart = await db.cart.findUnique({ where: { userId } });

    // Skip outdated job (important for retries/out-of-order)
    if (cart.version > redisVersion) {
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${redisVersion} < DB v${cart.version}`);
        return;
    }

    if (cart.version !== redisVersion - 1) {
        await fullCartSync(userId, redisVersion);
        return;
    }

    await db.cartItem.delete({
        where: { cartId_bookId: { cartId: cart.id, bookId } }
    });

    await db.cart.update({
        where: { id: cart.id },
        data: { version: redisVersion }
    });

    console.log(`[persistCartRemove] done for user ${userId} -> v${redisVersion}`)
}


export const persistCartClear = async ({ userId }) => {
    const redisVersion = await getCartVersion(userId);

    const cart = await db.cart.findUnique({ where: { userId } });

    // Skip outdated job (important for retries/out-of-order)
    if (cart.version > redisVersion) {
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`);
        return;
    }

    if (cart.version !== redisVersion - 1) {
        await fullCartSync(userId, redisVersion);
        return;
    }

    await db.cartItem.deleteMany({
        where: { cartId: cart.id }
    });

    await db.cart.update({
        where: { id: cart.id },
        data: { version: redisVersion }
    });

    console.log(`[persistCartClear] done for user ${userId} -> v${version}`)
}