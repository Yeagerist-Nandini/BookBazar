//dead letter queue 
import { Queue } from "bullmq";
import { bullConnection } from "../bullmq.js";
import { CART_DLQ } from "../constants/cart.constant.js";



export const cartDLQ = new Queue(CART_DLQ, {
    connection: bullConnection,
});