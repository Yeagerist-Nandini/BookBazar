import { Worker } from "bullmq";
import { RESERVATION_QUEUE } from "../constants/order.constant";
import { failOrder } from "../../services/order.service";
import { handleReservationExpire } from "../jobs/reservation.job.js";

const workerOptions = {
    connection: bullConnection
}

export const reservationWorker = new Worker(
    RESERVATION_QUEUE,
    async (job) => {
        const { orderId } = job.data;
        await handleReservationExpire(orderId);

        // await failOrder(orderId);
    },
    workerOptions
)

// import { orderEventsPublisher } from '../wsPublisher.js';
// orderEventsPublisher.publish('order.expired', { orderId });
