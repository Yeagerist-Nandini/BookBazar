import { Worker } from "bullmq";
import { NOTIFY_QUEUE } from "../constants/order.constant.js";
import { handleNotifyJob } from "../jobs/notify.job.js";

const workerOptions = {
    connection: bullConnection
}

export const notifyWorker = new Worker(
    NOTIFY_QUEUE,
    async (job) => {
        await handleNotifyJob(job);
    },
    workerOptions
)


notifyWorker.on("completed", (job) => {
    console.log(`Notify job completed for order ${job.data.orderId}, type=${job.data.type}`);
});

notifyWorker.on("failed", (job, err) => {
console.error(`Notify job failed for order ${job?.data?.orderId}`, err);
});
