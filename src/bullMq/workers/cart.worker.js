import { Worker } from "bullmq";
import { CART_QUEUE } from "../constants.js/cart.constant";
import { bullConnection } from "../bullmq.js"
import { persistCart } from "../jobs/cart.jobs";


const workerOptions = {
    connection: bullConnection
}

export const cartWorker = new Worker(CART_QUEUE,
    async (job) => {
        await persistCart(job.data);
    },
    workerOptions
);