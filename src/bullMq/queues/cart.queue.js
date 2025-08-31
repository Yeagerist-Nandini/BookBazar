import { Queue } from "bullmq";
import { bullConnection, defaultJobOptions } from "../bullmq.js";
import { CART_QUEUE } from "../constants/cart.constant.js";

export const cartQueue = new Queue(CART_QUEUE, {
    connection: bullConnection,
    defaultJobOptions
});