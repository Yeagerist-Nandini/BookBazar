//dead letter queue 
import { Queue } from "bullmq";
import { bullConnection } from "../bullmq";
import { CART_DLQ } from "../constants.js/cart.constant";



export const cartDLQ = new Queue(CART_DLQ, {
    connection: bullConnection,
    defaultJobOptions: {
        removeOnComplete: {age: 7 * 24 * 60 * 60 }, //7 days
        removeOnFail: { age: 14 * 24 * 60 * 60}, //14 days
    }
});