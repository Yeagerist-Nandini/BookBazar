import { Queue } from "bullmq";
import { bullConnection } from "../bullmq";
import { RESERVATION_QUEUE, ORDER_QUEUE } from "../constants/order.constant";


export const orderQueue = new Queue(ORDER_QUEUE, { 
    connection: bullConnection,
})

export const reservationQueue = new Queue(RESERVATION_QUEUE, {
    connection: bullConnection, 
    
})