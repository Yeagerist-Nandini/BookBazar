import { Worker } from "bullmq";
import { RESERVATION_QUEUE } from "../constants/order.constant";
import { handleReservationExpire } from "../jobs/reservation.job.js";

const workerOptions = {
    connection: bullConnection
}

export const reservationWorker = new Worker(
    RESERVATION_QUEUE,
    async (job) => {
        if(job.name === "reservation:expire"){
            const { orderId } = job.data;
            await handleReservationExpire(orderId);
        }
    },
    workerOptions
)
