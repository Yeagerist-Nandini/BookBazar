import { QueueEvents } from "bullmq";
import { CART_QUEUE } from "../queues/cart.queue";
import { bullConnection } from "../bullmq";

const events = new QueueEvents(CART_QUEUE, {
    connection: bullConnection
});

events.on("failed", async({jobId, failedReason, prev}) => {
    //prev is the number of attempts done
    console.error(`[cartQueue] Job ${jobId} failed: ${failedReason}`);
})

events.on("completed", async ({jobId, returnvalue}) => {
    console.log(`[cartQueue] Job ${jobId} completed with : ${returnvalue}`);
})

events.on("stalled", async ({jobId}) => {
    console.warn(`[cartQueue] Job ${jobId} stalled`);
})


// Optional: when a job exhausts attempts, move to DLQ
events.on("drained", async () => {
    // Drain event means no waiting jobs; we rely on worker to move to DLQ on final failure.
    // (See worker code)
});
  

export default events;