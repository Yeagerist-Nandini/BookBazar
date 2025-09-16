Perfect 👍 thanks for clarifying, Nandini.
Let’s go **from absolute scratch** on **Windows 10** and I’ll walk you through step by step how to test your system.

---
# 🛠 Step 1. Install Redis on Windows

Redis doesn’t officially support Windows, but you can run it with **Docker** or **Memurai**.

### ✅ Option A (recommended): Docker

1. Install **Docker Desktop**: [Docker for Windows](https://www.docker.com/products/docker-desktop/).
2. Run Redis:

   ```bash
   docker run --name redis -p 6379:6379 -d redis
   ```
3. Check it’s running:

   ```bash
   docker ps
   ```

   → should show `redis`.   
4. To verify connection:

    ```bash
    redis-cli ping
    ```

    → should return `PONG`.

---

# 🛠 Step 2. Setup PostgreSQL

4. Add `.env` file in your project root:

   ```env
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/bookstore"
   REDIS_URL="redis://127.0.0.1:6379"
   ACCESS_TOKEN_REQUEST="your_jwt_secret"
   PORT=8000
   ```

---

# 🛠 Step 3. Setup Prisma

1. npm i prisma --save-dev  (it is for cli-purposes)
2. npx prisma init

3. setup schema.prisma

4. npm i @prisma/client (it is for communication with DB)
- setup db.js
- directUrl = env("DIRECT_DATABASE_URL")

5. npx prisma generate

6. npx prisma migrate dev --name init
7. npx prisma generate

---

# 🛠 Step 5. Run Your Server

Start your backend:

---

# 🛠 Step 6. Test BullMQ

Right now your server creates a `Queue`.
But BullMQ only runs jobs if you also start a **Worker process**.
➡️ Make a file like `cart.worker.js`

```bash
node src/bullMq/workers/cart.worker.js
```

Now → whenever you hit **add to cart**, it pushes to Redis → Worker consumes it.

---

# 🛠 Step 7. Test APIs with Postman

Open Postman → test routes:

* `POST http://localhost:8000/api/v1/cart/add`
* `GET http://localhost:8000/api/v1/cart`

Check logs:

* Worker should log jobs.
* Redis should show published messages.

---

# 🛠 Step 8. Test WebSocket

1. Install **Postman** (it has WebSocket testing) OR write a quick test script.

### Using Postman:

* Open "New" → "WebSocket request".
* Enter:

  ```
  ws://localhost:8000
  ```
* Add headers/cookies with your `accessToken`.

If connection works → you’ll see `"Socket connected: ... user:..."` in logs.

### Using Node client (`testClient.js`):

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:8000", {
  extraHeaders: {
    Cookie: "accessToken=your_jwt_token_here"
  }
});

socket.on("connect", () => console.log("connected", socket.id));
socket.on("cart:update", (data) => console.log("cart updated", data));
```

Run:

```bash
node testClient.js
```

Now → when you add to cart from Postman, your WebSocket client should log `cart updated`.

---

✅ At this point you’ll have tested **all layers**:

* API → Prisma → BullMQ → Redis → Worker → Pub/Sub → WebSocket.

---

Do you want me to **prepare a checklist of exact terminal commands + Postman steps** so you can literally copy-paste and test step by step?




# In lua eval send everything as string, else it will give error

- nil ka dhyan
- json.get returns array as strings
- so do cjson.encode(val)[1]
- use exists to check existence.


- BullMQ immediately creates its housekeeping keys in Redis:

bull:cartQueue:meta → metadata about the queue

bull:cartQueue:stalled-check → used to check stuck jobs

bull:cartQueue:id and others → counters, job lists, etc.


---

## 🔹 Book Bazar Order Flow

### **1. Cart**

* Cart lives in **Redis**:
  `cart:{userId}` → `{ sku: qty }`
* User adds/removes items → cart updated in Redis (already done in your cart impl).

---

### **2. Place Order**

1. User hits **POST `/orders`** (with `Idempotency-Key` header).
2. Server flow:

   * Load cart from Redis.
   * Validate product details & prices from DB.
   * Create `order` row in DB (`PENDING`).
   * Copy cart items into `order_items`.
   * Atomically **reserve stock** via Lua script (deduct from `stock:{sku}`, store in `resv:{orderId}`, set TTL).
   * Update order status → `PAYMENT_PENDING`.
   * Enqueue a **reservation expiry job** in BullMQ (15 min).
   * Publish WebSocket event `order.created` to `user:{id}` room.
   * Return `orderId + total` to client.

---

### **3. Payment Init**

* Client calls **POST `/payments/init`** with `orderId`.
* Server flow:

  * Verify order status = `PAYMENT_PENDING`.
  * Create payment intent with provider (e.g., Stripe, Razorpay).
  * Save `payment_intent_id` + `payment_provider` in `order`.
  * Return client secret/redirect URL.

---

### **4. Payment**

* User completes payment with provider.
* Provider calls **POST `/payments/webhook`**.

**Webhook handler**:

* Verify provider signature.
* Lookup order by `payment_intent_id`.
* If order already `PAID` → ignore (idempotent).
* Else:

  * Update order → `PAID`.
  * Clear reservation TTL marker (`resvTTL:{orderId}`).
  * Stock already deducted (thanks to reservation).
  * Enqueue:

    * `fulfillment` (ship, etc.)
    * `notify` (email/SMS/WebSocket).
  * Publish WS event `order.paid`.

---

### **5. Reservation Expiry (safety net)**

* If no payment confirmation arrives within TTL:

  * BullMQ job `reservation:expire` triggers.
  * Check order status:

    * If still `PAYMENT_PENDING` → update `EXPIRED`.
    * Release stock via Lua (restore `stock:{sku}` from `resv:{orderId}`).
  * Publish WS event `order.expired`.

---

### **6. Order Lifecycle (status transitions)**

```
PENDING → PAYMENT_PENDING → PAID → FULFILLING → SHIPPED → DELIVERED
              ↘ (FAILED/EXPIRED) ↙
```

---

### **7. WebSockets + Pub/Sub**

* Your WS server joins users into rooms (`user:{id}`).
* Publish to Redis channel `order:events`.
* Example events:

  * `order.created` → show “Complete payment in 15m”
  * `order.paid` → show success screen
  * `order.expired` → show “Order expired, stock released”

---

### **8. Background Jobs (BullMQ)**

* `reservation:expire` → releases stock if unpaid.
* `fulfillment` → processes shipment creation.
* `notify` → sends confirmation email/SMS.
* `payment:verify` (optional watchdog) → re-checks payment status.

---

### **9. Concurrency / Safety Guards**

* **Idempotency key** prevents duplicate orders.
* **Lua scripts** ensure no overselling.
* **Webhook is authoritative** for marking `PAID`.
* **Delayed jobs** + **TTL keys** ensure expired orders clean up stock.
* **Outbox pattern** can guarantee all WS/email notifications are delivered.

---

🔑 So the whole lifecycle looks like this:

**Cart in Redis** →
**POST /orders** (DB order + Lua stock reserve + WS) →
**POST /payments/init** (provider intent) →
**Webhook** (mark PAID, notify, fulfill) →
**BullMQ expire job** (if unpaid, release stock + notify).

---
How's the workflow for orders ?

I want you to  **write the full code skeleton** for all of this in Express (routes + controllers + BullMQ processors + Redis Lua scripts + WS events) one working flow end-to-end?
And also use node-redis not ioredis.










//cart.controller.js
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as cartService from '../services/cart.service.js'


export const addToCart  = asyncHandler( async(req, res) => {
    const userId = '1e9d71c0-5e4e-4f50-87fe-7dd8b9307024' //req.user.id
    // const userId = req.user.id;
    const { bookId, quantity } = req.body;

    const latest_cart = await cartService.addItemToCart(userId, bookId, quantity);

    return res
           .status(200)
           .json(new ApiResponse(200, latest_cart, "Added Item to cart successfully!"))
})

export const removeFromCart = asyncHandler( async(req, res) => {
    const userId = '1e9d71c0-5e4e-4f50-87fe-7dd8b9307024' //req.user.id
    // const userId = req.user.id;
    const { bookId } = req.body;

    const cart = await cartService.removeCartItem(userId, bookId);
   
    return res
           .status(200)
           .json(new ApiResponse(200, cart, "Deleted Item successfully!"))
})

export const getCart = asyncHandler( async(req, res) => {
    const userId = '1e9d71c0-5e4e-4f50-87fe-7dd8b9307024' //req.user.id
    // const userId = req.user.id;

    const cart = await cartService.getCart(userId);
   
    return res
           .status(200)
           .json(new ApiResponse(200, cart, "Fetch cart successfully"))
})

export const clearCart = asyncHandler( async(req, res) => {
    const userId = '1e9d71c0-5e4e-4f50-87fe-7dd8b9307024' //req.user.id
    // const userId = req.user.id;

    await cartService.clearCart(userId);

    return res.status(200).json(new ApiResponse(200, {}, "Cart cleared"));
})

//cart.service.js

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


//cart.job.js

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

    const client = await redisClient();
    let version = await client.json.get(cart_key, { path: "$.version" });

    if(Array.isArray(version)) version = version[0];

    if(!version) return 0;
    console.log(version);

    return Number(version);
}


const fullCartSync = async (userId) => {
    const cart_key = `cart:user:${userId}`;
    const client = await redisClient();
    const redisCart = await client.json.get(cart_key, { path: "$" });

    console.log(redisCart);

    // redis returns array 
    const snapshot = redisCart[0]; // JSON.GET "$" returns array
    const {version, totalAmount, updatedAt, ...items} = snapshot;

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
                    data: { version: version }
                })
            ]);
        }
        console.log(`[fullCartSync] Cleared DB cart for user ${userId} -> v${version}`);
        return;
    }

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
    if (cart.version >= redisVersion) {
        console.log(
            `[persistCartAdd] Skip outdated job for user ${userId}: incoming v${redisVersion} < DB v${cart.version}`
        );
        return;
    }

    console.log(cart.version, redisVersion)

    if (cart.version !== redisVersion - 1) {
        // Out of sync → full sync
        await fullCartSync(userId);
        return
    }

    const cartItem = await db.cartItem.upsert({
        where: { cartId_bookId: { cartId: cart.id, bookId } },
        update: { quantity: quantity },
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
    if (cart.version >= redisVersion) {
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${redisVersion} < DB v${cart.version}`);
        return;
    }

    if (cart.version !== redisVersion - 1) {
        await fullCartSync(userId);
        return;
    }

    await db.$transaction([
        db.cartItem.delete({
            where: { cartId_bookId: { cartId: cart.id, bookId } }
        }),    
        db.cart.update({
            where: { id: cart.id },
            data: { version: redisVersion }
        })
    ]);

    console.log(`[persistCartRemove] done for user ${userId} -> v${redisVersion}`)
}


export const persistCartClear = async ({ userId }) => {
    const redisVersion = await getCartVersion(userId);

    const cart = await db.cart.findUnique({ where: { userId } });

    // Skip outdated job (important for retries/out-of-order)
    if (cart.version >= redisVersion) {
        console.log(`[persistCartRemove] Skip outdated job for user ${userId}: incoming v${version} < DB v${cart.version}`);
        return;
    }

    if (cart.version !== redisVersion - 1) {
        await fullCartSync(userId);
        return;
    }

    await db.$transaction([
        db.cartItem.deleteMany({
            where: { cartId: cart.id }
        }),
        db.cart.update({
            where: { id: cart.id },
            data: { version: redisVersion }
        })
    ]);
    

    console.log(`[persistCartClear] done for user ${userId} -> v${redisVersion}`)
}

// sockerServer.js 
import http from 'http';
import { Server } from 'socket.io';
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import app from '../app.js';
import dotenv from "dotenv";
import { ApiError } from "../utils/api-error.js";
import  jwt  from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { redisPub, redisSub } from "../utils/redisClient.js";

dotenv.config();

let io;


export const createSocketServer = async({port}) => {
    //1.  Wrap Express in HTTP server
    const httpServer = http.createServer(app);


    //2. Create Socket.IO server
    io = new Server(httpServer, {
        cors: { 
            origin: "*",
            allowedHeaders: ['*'],
            credentials: true
        },
    });

    //3. create two redis clients for adapter/ Redis adapter for multi-instance scaling
    const pubClient = await redisPub();
    const subClient = await redisSub();
    io.adapter(createAdapter(pubClient, subClient));

    // 🔹 Subscribe to cart updates after subscriber connects
    await subClient.pSubscribe("cart:update:user:*", (message, channel) => {
        const userId = channel.split(":")[3];
        const updatedCart = JSON.parse(message);

        // emit to all sockets in that user's room
        io.to(`user:${userId}`).emit("cart:update", updatedCart);
    })

    
    //4. Auth + join per-user rooms
    io.use((socket, next) => {
        cookieParser()(socket.request, {}, (err)=> {
            if(err) return next(err);

            const token = `eyJhbGciOiJIUzI1NiJ9.eyJpZCAiOiIxZTlkNzFjMC01ZTRlLTRmNTAtODdmZS03ZGQ4YjkzMDcwMjQifQ.`

            // const token = socket.request.cookies.accessToken;
            if(!token) return next(new ApiError(400, "Authentication Error ws"))

            const payload = jwt.verify(token, process.env.ACCESS_TOKEN_REQUEST);
            socket.userId = payload.id;

            return next();
        })
    })


    //5. On connection, join a per-user room and optionally a session room
    io.on("connection", (socket) => {
        const userId = socket.userId;
        if(!userId){
            socket.disconnect(true);
            return;
        }

        const userRoom = `user:${userId}`;
        socket.join(userRoom);
        console.log(`Socket connected: ${socket.id} user:${userId}`);


        //Handle socket events here

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected', reason);
        });
    });

    //6. Start server
    httpServer.listen(port, () => {
        console.log(`Server is running on port: ${port}`)
    });

    return io;
}


export const getIO = () => {
    if(!io) throw new ApiError(500, "Socket.io not initialized yet");

    return io;
}



//cart.worker.js 
import { Worker } from "bullmq";
import { CART_QUEUE } from "../constants/cart.constant.js";
import { bullConnection } from "../bullmq.js"
import { persistCartAdd, persistCartClear, persistCartRemove } from "../jobs/cart.jobs.js";
import { cartDLQ } from "../queues/cart.dlq.queue.js";


const workerOptions = {
    connection: bullConnection
}

export const cartWorker = new Worker(
    CART_QUEUE,
    async (job) => {
        if(job.data.action === "add"){
            await persistCartAdd(job.data);
        }
        else if(job.data.action === "remove"){
            await persistCartRemove(job.data);
        }
        else if(job.data.action === "clear"){
            await persistCartClear(job.data);
        }
        else {

        }
    },
    workerOptions
);


//Handle failed jobs
cartWorker.on("failed", async(job, err) => {
    console.error(`[CartWorker] Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);

    // If job fails even after retries, push the failed job in dlq for logging and analysis
    if(job.attemptsMade >= job.opts.attempts){
        const data = {
            originalQueue: CART_QUEUE,
            action: job.data.action,
            payload: job.data,
            failedAt: new Date(),
            reason: err.message,
        };

        const jobOptions = {
            attempts: 1,              // don’t retry inside DLQ
            removeOnComplete: false,  // keep for inspection
            removeOnFail: false       // keep if DLQ fails
        };          

        await cartDLQ.add("persistCartDlq", data, jobOptions);
        console.log(`CartWorker job ${job.id} moved to DLQ`);
    }
});


//redisClient.js

import { createClient } from "redis"

let client = null;

const redisClient = async () => {
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL });

        client.on("error", (error) => {
            console.error(error);
        });

        client.on("connect", () => {
            console.log("Redis connected");
        });

        await client.connect();
    }

    return client;
}


// publisher client 
let pubClient = null;
export const redisPub = async () => {
    if (!pubClient) {
        pubClient = createClient({ url: process.env.REDIS_URL });

        pubClient.on("connect", () => {
            console.log("Redis Pub connected");
        });

        pubClient.on("error", (error) => {
            console.error('Redis pub error', error);
        })

        await pubClient.connect();
    }
    return pubClient;
}


// subscriber client 
let subClient = null;
export const redisSub = async () => {
    if (!subClient) {
        subClient = createClient({ url: process.env.REDIS_URL });

        subClient.on("connect", () => {
            console.log("Redis Sub connected");
        });

        subClient.on("error", (error) => {
            console.error('Redis Sub error', error);
        })

        await subClient.connect();
    }
    return subClient;
}

export default redisClient;