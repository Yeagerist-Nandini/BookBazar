import { Worker } from "bullmq";
import { CART_QUEUE } from "../constants.js/cart.constant";
import { bullConnection } from "../bullmq.js"
import { persistCartAdd, persistCartClear, persistCartRemove } from "../jobs/cart.jobs";


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