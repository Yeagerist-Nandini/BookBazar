import { Queue } from "bullmq";

import { bullConnection, defaultJobOptions } from "../bullmq";

export const CART_QUEUE = "cartQueue";

export const cartQueue = new Queue(CART_QUEUE, {
    connection: bullConnection,
    defaultJobOptions
});