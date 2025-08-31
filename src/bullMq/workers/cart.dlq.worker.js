import { Worker } from "bullmq";
import {CART_DLQ} from "../constants/cart.constant.js"


export const cartDLQWorker = new Worker(
    CART_DLQ,
    async (job) => {
        console.log(`[DLQ] Handling failed job from ${job.data.originalQueue}`);
        // log the job into s3 for logging and analysis
    }
)