import { Worker } from "bullmq";
import { CART_QUEUE } from "../constants.js/cart.constant";
import { bullConnection } from "../bullmq.js"
import { persistCartAdd, persistCartClear, persistCartRemove } from "../jobs/cart.jobs";
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
