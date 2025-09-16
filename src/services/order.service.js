import { ApiError } from "../utils/api-error";
import { db } from "../utils/db";
import redisClient from "../utils/redisClient";

const CART_PREFIX = "cart:user:";


export const createOrder = async(userId) => {
    try {
        //1. Load cart from redis 
        const cart_key = `${CART_PREFIX}${userId}`;

        const redis_client = await redisClient();
        let cart_data = await redis_client.json.get(cart_key);
        cart_data = cart_data[0];

        if(!cart_data || Object.keys(cart).length === 0)
            throw new ApiError(400, 'Cart Empty');

        //2. extract cart items
        const items = Object.entries(cart_data)
                        .filter(([key, val]) => key!=="version" && key!=="updatedAt" && key!=="totalAmount")
                        .map(([bookId, data]) => (
                            {
                                bookId, 
                                quantity: data.quantity,
                                price: data.price,
                                title: data.title
                            }
                        ));

        if(items.length === 0){
            throw new ApiError(400, 'Cart Empty');
        }

        //3. Validate stock and price from db
        const books = await db.book.findMany({
            where: { id: {in: items.map(i => i.bookId)}},
            select: { 
                id: true, 
                stock: true, 
                price: true
            }
        });

        for(const item of items){
            const book = books.find((b) => b.id === item.bookId);

            if(!book){
                //TODO: automatically remove this item from cart if this book doesn't exist
                throw new ApiError(404, "book doesn't exist");
            }

            if(book.stock < item.quantity){
                //TODO: update quantity in redis
                throw new ApiError(400, "book out of stock");
            }

            if(book.price != item.price){
                //TODO: update price in redis
                item.price = book.price;
            }
        }

        //4. create order
        const totalAmount = items.reduce((sum, item) => (
            sum + (item.price * item.quantity)
        ), 0);

        const order = await db.order.create({
            data: {
                userId,
                status: 'PENDING',
                totalAmount,
                orderItem: {
                    create: items.map((item) => ({
                        bookId: item.bookId,
                        quantity: item.quantity,
                        unit_price: item.price
                    }))
                }
            },
            include: {orderItem: true}
        });

        //5. Reserve stock via Lua script
        await redis_client.eval();

        //6. store reservation data + ttl in redis

        //7. update payment status -> pending

        //8. Enqueue reservation expiry job

        //9. publish ws event
        
        return order;
    } catch (error) {
        throw new ApiError(500, "Error while creating order", error);
    }
}