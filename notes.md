- if cart has for more than 1 week then mail them using MQs
- use cron jobs maybe ?

- if book detail got updated, then update book directly
- update (title/price) cart via MQ,

- delete book => sync redis cache, mq: sync redis db

- book got out of stock ?

-  ?



# Target end of Sept
----------------------------------------------------------------------------
## get total amount  

## get cart 
- get it from redis
- **redis cart will always be there coz it's primary db for cart**

## remove item from cart 
- check if book exists ?
- delete it from redis
- get redis '$.totalAmount' by using lua
- update user via ws and pub/sub
- update DB via mqs

## clear cart
- delete redis cart for that user 
- update via ws and pub sub 
- delete all cartItems and reset cart (or delete) 

## sync DB cart to redis cart every day using MQs and cron jobs
## handling DEAD LETTER QUEUES

## only implement cart for now 
## then implement books and user auth 


## then build frontend for this(hehe)
------------------------------------------------------

## then implement orders 
## then implement checkouts 


redis json.get returns "[]"
Bulk string reply: a JSON-encoded string representing the value(s) at the specified path(s).
redis.exists return 0 or 1


- socketServer.js line 51
- cart controller userId

after updating cart => manage book stock 
price in cartItem too.
loading lua scripts properly



##
Yes — for a **cart system** your current approach (WS + Pub/Sub + MQ) is exactly what a lot of production e-commerce platforms do.

Here’s why your setup makes sense:

---

### **1. WebSockets (WS)**

* Keeps the cart UI instantly in sync for the *same user* who’s actively shopping.
* Low-latency updates without polling.
* Ideal for interactive experiences.

---

### **2. Redis Pub/Sub**

* Broadcasts cart changes to all API instances or services that care.
* Useful if the same user is logged in from multiple devices, or you have multiple app servers behind a load balancer.
* Works great for horizontal scaling.

---

### **3. Message Queue (BullMQ)**

* Handles **persistence and heavy processing** asynchronously.
* If DB is slow or temporarily unavailable, jobs retry until data is safely stored.
* Keeps your API responsive — you don’t block the checkout flow waiting on slow DB writes.

---

✅ **Advantages of combining all three**

* **Real-time UX** (WebSockets)
* **Cross-instance events** (Redis Pub/Sub)
* **Durable background tasks** (BullMQ)
* Decoupled architecture → easy to scale parts independently.

---

⚠ **Common pitfalls to watch for**

1. **Double work**: Ensure the same cart change isn’t processed twice (idempotency keys help).
2. **Order of events**: WS messages might arrive before the persistence job runs — handle “eventual consistency” in UI.
3. **Failure alerts**: Monitor BullMQ for stuck or failed jobs; carts are sensitive data.



## is it enough to send only bookId in pub/sub ?

- It depends on who consumes your pub/sub messages and what they already know.

### 🔎 If you send only bookId

Pros: lightweight, small payload.

Cons: frontend (or any subscriber) will then need to look up details (title, price, etc.) from either Redis or DB to update the UI.

This means an extra fetch → more latency.

### 🔎 If you send bookId + metadata (title, price, quantity, …)`

Pros: subscribers can immediately update UI or cache with no extra fetch.

Cons: slightly larger payload (but usually negligible for cart updates).


## which is better full sync or incremental sync (per-item add/remove/clear with version checks) 


### 🔎 Option A: Incremental sync (what you have now)

* **Pros**

  * Less DB writes → only change what’s needed.
  * Fine-grained logging & control (add/remove/clear separate functions).
  * Version checks handle retries, out-of-order jobs, and idempotency.
  * Works well for high-traffic carts.

* **Cons**

  * More code paths to maintain (three different persistence functions).
  * Slightly more complex (need versioning, idempotency logic).

---

### 🔎 Option B: Full sync on every update

* **Pros**

  * Very simple → one function (`persistCart(userId)`).
  * No need to maintain add/remove/clear paths.
  * No risk of DB/Redis divergence (source of truth is always Redis snapshot).
* **Cons**

  * More expensive → overwriting whole cart table on every small update (extra writes).
  * For large carts, DB writes become heavy (esp. if users frequently add/remove items).
  * Still need version checks to avoid stale overwrites.

---

### ✅ Best practice (in real systems)

* For **small carts & low traffic** → full sync is fine (simple, reliable).
* For **bigger scale** → incremental sync with versioning (your current design) is **better** because:

  * You only update what changed.
  * You avoid rewriting the whole cart table on every tiny change.
  * Easier to scale horizontally (workers can process events independently).

Your current approach (with `version` checks) is exactly how large e-commerce systems (Amazon, Flipkart) keep DB & cache consistent.


## Failure window

**what if a remove item job fails due to some even after some retries. and after that user updates cart, then the db will have the stale data ?**

You’ll have **DB divergence**.

---

### ✅ How to fix this problem

You basically need a **self-healing mechanism** when jobs fail, otherwise your DB lags behind Redis forever. Some options:

---

#### 1. **Idempotent full-sync fallback**

* Keep your **incremental jobs as primary** (efficient, fine-grained).
* But if a job fails permanently (DLQ or exceeds retries), enqueue a **full cart sync job**:

  ```js
  await cartQueue.add("fullSync", { userId }, { priority: 0 });
  ```
* The worker will dump Redis cart → overwrite DB snapshot.
* This guarantees DB eventually matches Redis, even if one step failed.

---

#### 2. **Periodic background reconciliation**

* Run a cron/worker job every few minutes that:

  * Reads Redis carts.
  * Compares version against DB version.
  * If `redis.version > db.version`, resync DB from Redis.
* Ensures consistency even if some jobs slip.

---

#### 3. **Make every job "upsert whole item state"**

* Instead of remove = “delete bookId row”, make it:

  * Always **overwrite cart state from Redis for that item**.
* That way, even if remove job fails, the *next* add/update job carries the **correct Redis version & state** and “fixes” the DB row.
* Example: `persistCartAdd` first checks Redis for the latest state of that `bookId` and writes exactly that to DB (not just quantity).

---

#### 4. Can check if the version of db is v-1 or not if not full redis sync
* Prevents divergence without relying only on DLQ.

* Ensures DB can’t “skip” a failed operation.

* Still efficient most of the time (only full-syncs when something went wrong).

---

### ⚖️ Trade-offs

* **Option 1 (fallback full-sync)** → practical, cheap, and only triggers on failures.
* **Option 2 (periodic reconciliation)** → good if you want *guaranteed eventual consistency* no matter what.
* **Option 3 (always re-fetch state from Redis)** → strongest correctness, but increases Redis lookups per job.



## What will happen if lua script fails ? then the job will note be added in the queue right ?

### Your current flow (for add/remove/clear):

1. **Step 1**: Run Lua in Redis (atomic update of cart JSON).
2. **Step 2**: If Lua succeeds → publish pub/sub event + push persistence job to queue.
3. **Step 3**: Worker consumes job, syncs DB.

---

### 🔎 If Lua script **fails**

* The code will throw before you reach the “push job” step.
* That means ✅ **no persistence job is queued** (which is good — because DB should never try to persist an update that didn’t actually succeed in Redis).
* Also ❌ no pub/sub update will be sent.
* Essentially: the operation **aborts early** → system consistency is preserved.

---

### ✅ Best practice (to be super safe)

* Keep Lua scripts **idempotent and atomic** (all-or-nothing).
* Wrap Lua in a **try/catch** on Node side → if it throws, you know Redis is unchanged (atomicity guarantee).
* Only after **success** do you enqueue the job + publish the update.
* If you’re really paranoid:

  * Run a **periodic full sync** (e.g., every few hours) so even if something rare slipped through, DB will catch up.

---



## versioning check add krne se DB data stale kb ho skta h: 
- If MQ service is down 
- If Redis crashes before persistence, DB might miss some updates.
- If the last update job fails and user doesn’t touch cart again, DB remains stale.
- If DB is only a backup in case Redis dies, staleness risk is more serious.

### solution: 
- DLQ + nightly reconciliation is how you cover this gap.



### what if mq is down, then we won't be able use even dlqs. and what if dlqs also failed what do to in those situations ?
---

#### 1️⃣ If MQ itself is down

  * **Backpressure / Fallback logging**: If MQ is unavailable, temporarily write job payloads to a local log (file, S3, or even a DB “cart\_jobs” table). Once MQ is back, a reconciler reads the backlog and pushes to MQ.
  * **Health checks + Alerts**: Monitor MQ availability. If it’s down, alert immediately (this is an infra problem, not app code).
  * **Nightly reconciliation job**: This is exactly why many teams still run a daily Redis→DB sync — it heals any gaps caused while MQ was down.

👉 *So if MQ is down, you fall back on Redis as source of truth, and DB catches up later via reconciliation.*

---

#### 2️⃣ If DLQ fails (or is full / misconfigured)

  * **Secondary DLQ / Parking lot**: Some systems have a *"dead-dead-letter queue"* (rarely needed, but possible).
  * **Fallback persistence**: If DLQ enqueue fails, log to disk/S3 for manual replay.
  * **Crash-only design**: Worst case, on next cart update your version check forces a `fullCartSync` → so DB recovers eventually.

👉 *So even if DLQ fails, your versioning + reconciliation sweep means data is never permanently lost.*

---

#### 3️⃣ “What if Redis itself goes down?”

* Redis is your primary source of truth — if it dies without persistence (RDB/AOF), you lose carts.
* **Mitigations**:

  * Enable Redis **AOF (Append Only File)** persistence with `everysec` policy.
  * Run Redis in **cluster with replication**.
  * Still keep DB updated (your current MQ+worker flow ensures DB is a backup).

---
💡 So the philosophy is:

* **Redis = always correct** (fast source of truth).
* **DB = eventually consistent backup** (healed by MQ jobs, DLQ, or reconciliation sweeps).
* As long as Redis is alive + persisted, your carts are safe.

---


## 🛒 For **cart persistence** DLQ use case:

I’d recommend **Option A (parking lot)** 🚦

* Cart is *not critical money movement* (like payment jobs).
* If it fails after 10 attempts, it’s better to alert + inspect manually instead of looping retries.
* Users can still see their cart from Redis in real-time → persistence can catch up later manually.

👉 So I’d set DLQ with:

```js
{
  attempts: 1,              // don’t retry inside DLQ
  removeOnComplete: false,  // keep for inspection
  removeOnFail: false       // keep if DLQ fails
}
```

--- 



//order.service.js 

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


//order.controller.js

import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import { asyncHandler } from "../utils/asyncHandler";
import { db } from "../utils/db";
import { updateOrderStatus, createOrderService } from "../services/order.service.js"

//first cart -> checkout -> create order -> payment
// if payment failed -> then order status cancelled
// else -> then order confirmed

//TODO: validation
export const createOrder = asyncHandler(async(req, res) => {
    const userId = req.user.id;

    const {orderId, totalAmount} = await createOrderService(userId);

    const order = await db.order.findUnique({
        where: { id: orderId}
    });
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, "Order created successfully!"))
});


export const getUserOrders = asyncHandler(async(req, res) => {
    const userId = req.user.id;

    const orders = await db.order.findMany({
        where: {userId},
        include: {
            orderItem: {
                include: {
                    book: true
                }
            }
        }
    });

    if(!orders) throw new ApiError(404, "Order not found");
    
    return res
            .status(200)
            .json(new ApiResponse(200, orders, "fetched orders successfully!"))
});

export const getOrderById = asyncHandler(async(req, res) => {
    const userId  = req.user.id;
    const { orderId } = req.params;

    const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
            orderItems: {
                include: { book: true }
            }
        }
    });

    if(!order) throw new ApiError(404, "Order not found");

    return res
            .status(200)
            .json(new ApiResponse(200, order, "Order fetched successfully!"))
});

export const cancelOrder = asyncHandler(async(req, res) => {
    const { orderId } = req.params;

    let order = await db.order.findUnique({
        where: {id: orderId}
    });
    if(!order) throw new ApiError(404, "Order not found");

    if(order.status != "PENDING") throw new ApiError(400, "Order can't be cancelled");

    order = await db.order.update({
        where: { id: orderId },
        date: { status: "CANCELLED" }
    });
});

export const getOrdersAdmin = asyncHandler(async(req, res) => {
    const orders = await db.order.findMany({});

    return res
            .status(200)
            .json(new ApiResponse(200, orders, "Orders fetched successfully"))
});


export const updateOrderStatusAdmin = asyncHandler(async(req, res) => {
    const {orderId} = req.params;
    const { status } = req.body;

    const order = await updateOrderStatus(orderId, status);

    //TODO: send mail to user after order status updation
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} successfull`))
});

// Payment success
export const paymentSuccess = asyncHandler(async (req, res) => {
    const {orderId} = req.params;

    const order = await updateOrderStatus(orderId, "CONFIRMED");

    //TODO: send mail to user after order status updation
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} successfull`))
});

// Payment failed
export const paymentFailed = asyncHandler(async (req, res) => {
    const {orderId} = req.params;

    const order = await updateOrderStatus(orderId, "CANCELLED");
    
    return res
            .status(200)
            .json(new ApiResponse(200, order, `Payment for order ${orderId} failed`))
});


//reservation.job.js
import { ApiError } from "../../utils/api-error";
import redisClient from "../../utils/redisClient"
import { db } from "../utils/db.js";

export const handleReservationExpire = async(orderId) => {
    const redis_client = await redisClient();

    try {
        //1. fetch order
        const order = await db.order.findUnique({
            where: { id: orderId },
            select: { status: true }
        });

        if(!order){
            throw new ApiError(404, `Order ${orderId} not found`);
        }

        //2. if order already paid/cancelled -> skip
        if (order.status !== "PENDING" && order.status !== "PAYMENT_PENDING"){
            console.log(`Order ${orderId} already processed with status ${order.status}`);
            return;
        }

        //3. Expire order in DB
        await prisma.order.update({
            where: { id: orderId },
            data: { status: "EXPIRED" },
        });

        //4. Release reserved stock via lua
        const luaScript = fs.readfileSync('src/lua/releaseReservation.lua', 'utf-8');
        const result = await redis_client.eval(luaScript,{
            keys: [],
            arguments: [orderId],
        });

        //5. Publish WS event
        await orderEventsPublisher.pulish("", {

        });

        console.log(`Order ${orderId} expired & stock released`);
    } catch (error) {
        console.error("Error in reservation expiry job", err);
        throw new ApiError(500, "Error while handling reservation expiry");
    }
}


//reservation.worker.js
import { Worker } from "bullmq";
import { RESERVATION_QUEUE } from "../constants/order.constant";
import { handleReservationExpire } from "../jobs/reservation.job.js";

const workerOptions = {
    connection: bullConnection
}

export const reservationWorker = new Worker(
    RESERVATION_QUEUE,
    async (job) => {
        if(job.name === "reservation:expire"){
            const { orderId } = job.data;
            await handleReservationExpire(orderId);
        }
    },
    workerOptions
)


//order.queue.js
import { Queue } from "bullmq";
import { bullConnection } from "../bullmq.js";
import { RESERVATION_QUEUE, ORDER_QUEUE, NOTIFY_QUEUE, FULFILLMENT_QUEUE } from "../constants/order.constant.js";

export const reservationQueue = new Queue(RESERVATION_QUEUE, {
    connection: bullConnection, 
    
})


export const notifyQueue = new Queue(NOTIFY_QUEUE, { 
    connection: bullConnection 
});

//release reservation.lua
-- ARGV: orderId

local orderId = ARGV[1]
local resvKey = "resv:".. orderId

-- load reservation data (if exists)
local resv_data = redis.get(resvKey)
if not resv_data or resv_data == nil then
    return "NO_RESERVATION"
end

-- parse reservation data and increment stock
local items = cjson.decode(resv_data)

for i=1,item in ipairs(items) do
    local qty = tonumber(item.qty)
    local stock_key = item.bookId

    if qty > 0 then 
        redis.incrby(stock_key, qty)
    end
end

-- delete reservation 
redis.del(resvKey)

return "DONE"


//reserveStock.lua
-- KEYS: stock keys per book
-- ARGV: qty1, qty2, ..., orderId, TTL

local orderId = ARGV[#ARGV]
local ttl = tonumber(ARGV[#ARGV - 1])
local numOfItems = #KEYS
local resvKey = "resv:" .. orderId

-- check stock 
for i=1, numOfItems do 
    local stock = tonumber(redis.get(KEYS[i]))
    local qty = tonumber(ARGV[i])

    if stock == nil or stock < qty then 
        return "INSUFFICIENT_STOCK:"..KEYS[i]
    end 
end

-- deduct stock 
for i=1, numOfItems do 
    local qty = tonumber(ARGV[i])
    redis.decrby(KEYS[i], qty)
end

-- save reservation in redis 
local resvData = {}
for i=1, numOfItems do 
    resvData[i] = { bookId=KEYS[i], qty=ARGV[i] }
end


redis.set(resvKey, cjson.encode(resvData))
-- redis.call("EXPIRE", resvKey, ttl)

return "DONE"

-- output of redis.json.get => "[{data}]"
-- redis.get => 'data'

//socketServer.js
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
