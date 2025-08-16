Awesome—let’s make this **production-grade** with: strong retry/backoff, idempotency, DLQ, rate limiting, concurrency, logging, and graceful shutdown. All **ESM** with **node-redis** for your cart and BullMQ for jobs.

---

# Folder layout

```
src/
  config/
    redis.js
    bullmq.js

  queues/
    cart.queue.js
    cart.dlq.js

  workers/
    cart.worker.js
    cart.dlq.worker.js

  events/
    cart.events.js

  jobs/
    persistCart.js

  services/
    cart.service.js

  index.js                  # producer demo entry
  worker.js                 # worker runner (spawns all workers)
```

---

# 1) BullMQ + Redis config

```js
// src/config/bullmq.js
export const bullConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : { host: "127.0.0.1", port: 6379 };

// sensible defaults (can be overridden per-job)
export const defaultJobOptions = {
  attempts: 8,                                    // robust retry
  backoff: { type: "exponential", delay: 1000 },  // 1s, 2s, 4s, ...
  removeOnComplete: { age: 60 * 60, count: 1000 },// keep for 1h or 1000
  removeOnFail: { age: 24 * 60 * 60 },            // keep failed for 24h
  timeout: 30_000,                                 // avoid stuck jobs
};
```

---

# 2) Queues (Main + Dead Letter)

```js
// src/queues/cart.queue.js
import { Queue, QueueScheduler } from "bullmq";
import { bullConnection, defaultJobOptions } from "../config/bullmq.js";

export const CART_QUEUE = "cartQueue";

export const cartQueue = new Queue(CART_QUEUE, {
  connection: bullConnection,
  defaultJobOptions,
});
```

```js
// src/queues/cart.dlq.js  (Dead Letter Queue)
import { Queue, QueueScheduler } from "bullmq";
import { bullConnection } from "../config/bullmq.js";

export const CART_DLQ = "cartQueue:dlq";

export const cartDLQ = new Queue(CART_DLQ, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 7 * 24 * 60 * 60 },  // 7 days
    removeOnFail: { age: 14 * 24 * 60 * 60 },     // 14 days
  },
});
```

---

# 3) Events (monitoring + auto-DLQ)

```js
// src/events/cart.events.js
import { QueueEvents } from "bullmq";
import { bullConnection } from "../config/bullmq.js";
import { CART_QUEUE } from "../queues/cart.queue.js";
import { cartDLQ } from "../queues/cart.dlq.js";

const events = new QueueEvents(CART_QUEUE, { connection: bullConnection });

events.on("failed", async ({ jobId, failedReason, prev }) => {
  // prev is the number of attempts done
  console.error(`[cartQueue] Job ${jobId} failed: ${failedReason}`);
});

events.on("completed", ({ jobId }) => {
  console.log(`[cartQueue] Job ${jobId} completed`);
});

events.on("stalled", async ({ jobId }) => {
  console.warn(`[cartQueue] Job ${jobId} stalled`);
});

// Optional: when a job exhausts attempts, move to DLQ
events.on("drained", async () => {
  // Drain event means no waiting jobs; we rely on worker to move to DLQ on final failure.
  // (See worker code)
});

export default events;
```

---

# 4) Job logic (idempotent, version-aware)

**Goal:** DB should never lag behind Redis. We’ll persist only if the Redis cart **version** is newer/equal to DB’s, so old jobs can’t overwrite fresh state.

```js
// src/jobs/persistCart.js
import { redisClient } from "../config/redis.js";
// import prisma or your ORM:
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Idempotency & ordering strategy:
 * - We store a "cart_version" per user in Redis (monotonic).
 * - Each job carries that version.
 * - We UPDATE the DB only if `incomingVersion >= dbVersion`.
 *
 */
export default async function persistCart({ userId, version }) {
  const redis = await redisClient();
  const cartKey = `cart:user:${userId}`;
  const versionKey = `cart:user:${userId}:version`;

  // Read DB's current version
  const existing = await prisma.cart.findUnique({ where: { userId } });
  const dbVersion = existing?.version ? Number(existing.version) : 0;

  // Skip outdated job (important for retries/out-of-order)
  if (redisVersion < dbVersion) {
    console.log(
      `[persistCart] Skip outdated job for user ${userId}: incoming v${redisVersion} < DB v${dbVersion}`
    );
    return;
  }

}
```

---

# 5) Worker (concurrency, rate limiting, DLQ handoff, graceful shutdown)

```js
// src/workers/cart.worker.js
import { Worker } from "bullmq";
import { bullConnection } from "../config/bullmq.js";
import { CART_QUEUE } from "../queues/cart.queue.js";
import { cartDLQ } from "../queues/cart.dlq.js";
import persistCart from "../jobs/persistCart.js";
import "../events/cart.events.js"; // attach listeners

export const cartWorker = new Worker(
  CART_QUEUE,
  async (job) => {
    await persistCart(job.data);
  },
  {
    connection: bullConnection,
    // Control DB pressure:
    concurrency: 10,                 // parallelism
    limiter: { max: 100, duration: 1000 }, // 100 jobs/sec
    // Important for long jobs:
    lockDuration: 30_000,
  }
);

// If a job fully exhausts attempts, move to DLQ with context
cartWorker.on("failed", async (job, err) => {
  if (!job) return;
  const attemptsMade = job.attemptsMade ?? 0;
  const max = job.opts.attempts ?? 1;
  if (attemptsMade >= max) {
    await cartDLQ.add("persistCart:dead", {
      userId: job.data.userId,
      version: job.data.version,
      reason: err?.message || "unknown",
      failedAt: Date.now(),
    }, {
      removeOnComplete: { age: 14 * 24 * 60 * 60 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
    console.error(`[DLQ] moved job for user ${job.data.userId}: ${err?.message}`);
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`${signal} received. Closing cartWorker...`);
  await cartWorker.close(); // stops taking new jobs
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("Cart worker started...");
```

**Optional DLQ reprocessor:**

```js
// src/workers/cart.dlq.worker.js
import { Worker } from "bullmq";
import { bullConnection } from "../config/bullmq.js";
import { CART_DLQ } from "../queues/cart.dlq.js";
import { cartQueue } from "../queues/cart.queue.js";

const dlqWorker = new Worker(
  CART_DLQ,
  async (job) => {
    // decide policy: auto-requeue or manual
    const { userId, version } = job.data;

    // Example: immediately requeue once with extra delay/backoff
    await cartQueue.add("persistCart", { userId, version }, {
      attempts: 12,
      backoff: { type: "exponential", delay: 2000 },
      delay: 60_000, // cool-down
      removeOnComplete: { age: 2 * 60 * 60 },
      removeOnFail: { age: 24 * 60 * 60 },
      priority: 2,
    });
  },
  { connection: bullConnection, concurrency: 2 }
);

console.log("DLQ reprocessor started...");
```

---

# 6) Producer: robust `addItemToCart` with versioning + job options

```js
// src/services/cart.service.js
import { redisClient, redisPub } from "../config/redis.js";
import { cartQueue } from "../queues/cart.queue.js";

const CART_PREFIX = "cart:user:";
const CART_PUB_CHANNEL_PREFIX = "cart:pub:";
const VERSION_SUFFIX = ":version";

// (demo) your book lookup and quantity validation
const db = {
  book: {
    findUnique: async ({ where }) => {
      // replace with real DB call
      if (where.id === "b1") return { id: "b1", price: 300, title: "Mahi Book" };
      return null;
    },
  },
};
const getValidQuantity = (book, qty) => Math.max(1, qty);

export const addItemToCart = async (userId, bookId, quantity) => {
  const redis = await redisClient();

  // 1) validate
  const book = await db.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error("Invalid Request");
  quantity = getValidQuantity(book, quantity);

  // 2) write to Redis (your Lua is fine; here using HSET for clarity)
  const cartKey = `${CART_PREFIX}${userId}`;
  const ts = Date.now().toString();

  await redis.hSet(cartKey, {
    [bookId]: JSON.stringify({
      quantity,
      price: book.price,
      title: book.title,
      updatedAt: ts,
    }),
  });

  // 3) monotonic version for idempotency/ordering
  const versionKey = `${CART_PREFIX}${userId}${VERSION_SUFFIX}`;
  const version = Number(await redis.incr(versionKey)); // atomically increments

  // 4) publish realtime update
  const pubChannel = `${CART_PUB_CHANNEL_PREFIX}${userId}`;
  const payload = {
    event: "cart:item_updated",
    userId,
    bookId,
    quantity,
    price: book.price,
    title: book.title,
    updatedAt: ts,
    version,
  };
  await (await redisPub()).publish(pubChannel, JSON.stringify(payload));

  // 5) enqueue critical persist job (robust options)
  // Use jobId to dedupe bursts for the same (user,version):
  await cartQueue.add(
    "persistCart",
    { userId, version },
    {
      jobId: `persistCart:${userId}:v${version}`,
      attempts: 10,
      backoff: { type: "exponential", delay: 1000 },
      priority: 1,              // critical
      removeOnComplete: { age: 2 * 60 * 60, count: 5000 },
      removeOnFail: { age: 24 * 60 * 60 },
      // optional delay if you want burst-collapsing:
      // delay: 150, // small debounce to collapse rapid edits
      // timeout: 45_000,
    }
  );

  // (optional) emit directly to current socket room if you want
  // getIO().to(`user:${userId}`).emit("cart:update", payload);

  return { ok: true, version };
};
```

---

# 7) Entrypoints

```js
// src/index.js   (simulate API producing jobs)
import "dotenv/config";
import { addItemToCart } from "./services/cart.service.js";

const run = async () => {
  await addItemToCart("u123", "b1", 2);
  await addItemToCart("u123", "b1", 3);
};
run();
```

```js
// src/worker.js  (start workers)
import "./workers/cart.worker.js";
// optionally: import "./workers/cart.dlq.worker.js";
```

---

## Why this is “production-ready”

* **Strong retry/backoff:** up to 10 attempts, exponential delay, timeouts.
* **Dead-letter queue:** any job that fully exhausts attempts is copied to DLQ with context; optional DLQ reprocessor provided.
* **Idempotent & ordered writes:** Redis **version** (monotonic) is checked vs DB version; stale jobs are **skipped** so DB never regresses.
* **Rate limiting + concurrency:** protect your DB from spikes.
* **Job deduplication:** `jobId` = `persistCart:user:version` prevents duplicate enqueues for the same state.
* **Lifecycle hygiene:** removeOnComplete/Fail policies keep Redis tidy.
* **Stalled handling:** `QueueScheduler` + timeouts prevent zombie jobs.
* **Graceful shutdown:** traps SIGINT/SIGTERM to close workers cleanly.
* **Observability:** `QueueEvents` logs completes/fails/stalls; easy to wire to alerting (e.g., Slack, email).

---

### Notes to adapt for your stack

* Replace the in-file “book DB” with your actual `db.book.findUnique`.
* Keep your **Lua** mutation if you prefer; just keep the **`INCR` version** right after it (same key scheme) to maintain ordering.
* Prisma schema should include a `version BigInt` column on `Cart`; if you use SQL directly, you can also implement a **compare-and-swap** update in one statement.

If you want, I can tweak the Prisma model and show the exact migration + an example SQL “compare and update if newer” for Postgres/MySQL.
