import { Worker } from "bullmq";
import { RESERVATION_QUEUE } from "../constants/order.constant";
import { failOrder } from "../../services/order.service";

export const reservationWorker = new Worker(
    RESERVATION_QUEUE,
    async (job) => {
        const { orderId } = job.data;
        await failOrder(orderId);
    } 
)