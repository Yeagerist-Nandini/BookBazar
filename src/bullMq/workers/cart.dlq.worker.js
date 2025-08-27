import { Worker } from "bullmq";


export const cartDLQWorker = new Worker(
    "cartDLQ",
    async (job) => {
        console.log(`[DLQ] Handling failed job from ${job.data.originalQueue}`);
        // log the job into s3 for logging and analysis
    }
)