import { ApiError } from "../utils/api-error";
import { db } from "../utils/db";


export const updateOrderStatus = async(id, status) => {
    try {
        const order = await db.order.update({
            where: {id}, 
            data: {status}
        });
    
        if(!order) throw new ApiError(500, "Error while updating status");
    
        return order;
    } catch (error) {
        throw new ApiError(500, "Error while updating status", error);
    }
}

export const createOrder = async(userId, req_body) => {
    try {
        
    } catch (error) {
        throw new ApiError(500, "Error while creating order", error);
    }
}