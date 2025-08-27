//dead letter queue 
import { Queue } from "bullmq";
import { bullConnection } from "../bullmq";
import { CART_DLQ } from "../constants.js/cart.constant";



export const cartDLQ = new Queue(CART_DLQ, {
    connection: bullConnection,
});