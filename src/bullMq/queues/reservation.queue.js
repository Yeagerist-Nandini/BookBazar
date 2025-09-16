import { Queue } from "bullmq";
import { bullConnection, defaultJobOptions } from "../bullmq";
import { RESERVATION_QUEUE } from "../constants/order.constant";

export const reservationQueue = new Queue(RESERVATION_QUEUE, {
    connection: bullConnection, 
    
})