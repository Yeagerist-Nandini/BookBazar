import { ApiError } from "../../utils/api-error.js";
import redisClient from "../../utils/redisClient.js"
import { db } from "../utils/db.js";


export const handleNotifyJob = async (job) => {
  const { orderId, type } = job.data;

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    console.log(`Notification sent for order ${orderId}, type=${type}`);
  } catch (err) {
    console.error(`Notify job error for order ${orderId}`, err);
    throw err;
  }
};
