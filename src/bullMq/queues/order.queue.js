import { Queue } from "bullmq";
import { bullConnection } from "../bullmq.js";
import { RESERVATION_QUEUE, NOTIFY_QUEUE } from "../constants/order.constant.js";

export const reservationQueue = new Queue(RESERVATION_QUEUE, {
    connection: bullConnection, 
    
})


export const notifyQueue = new Queue(NOTIFY_QUEUE, { 
    connection: bullConnection 
});