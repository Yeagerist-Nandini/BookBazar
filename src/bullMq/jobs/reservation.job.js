import { ApiError } from "../../utils/api-error";
import redisClient from "../../utils/redisClient"
import { db } from "../utils/db.js";

export const handleReservationExpire = async(orderId) => {
    const redis_client = await redisClient();

    try {
        //1. fetch order
        const order = await db.order.findUnique({
            where: { id: orderId },
            select: { status: true }
        });

        if(!order){
            throw new ApiError(404, `Order ${orderId} not found`);
        }

        //2. if order already paid/cancelled -> skip
        if (order.status !== "PENDING" && order.status !== "PAYMENT_PENDING"){
            console.log(`Order ${orderId} already processed with status ${order.status}`);
            return;
        }

        //3. Expire order in DB
        await prisma.order.update({
            where: { id: orderId },
            data: { status: "EXPIRED" },
        });

        //4. Release reserved stock via lua
        const luaScript = fs.readfileSync('src/lua/releaseReservation.lua', 'utf-8');
        const result = await redis_client.eval(luaScript,{
            keys: [],
            arguments: [orderId],
        });

        //5. Publish WS event
        await orderEventsPublisher.pulish("", {

        });

        console.log(`Order ${orderId} expired & stock released`);
    } catch (error) {
        console.error("Error in reservation expiry job", err);
        throw new ApiError(500, "Error while handling reservation expiry");
    }
}
