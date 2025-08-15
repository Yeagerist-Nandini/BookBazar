import { createClient } from "redis"

let client = null;

const redisClient = async () => {
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL });

        client.on("error", (error) => {
            console.error(error);
        });

        client.on("connect", () => {
            console.log("Redis connected");
        });

        await client.connect();
    }

    return client;
}


// publisher client 
let pubClient = null;
export const redisPub = async () => {
    if (!pubClient) {
        pubClient = createClient({ url: process.env.REDIS_URL });

        pubClient.on("connect", () => {
            console.log("Redis Pub connected");
        });

        pubClient.on("error", (error) => {
            console.error('Redis pub error', error);
        })

        await pubClient.connect();
    }
    return pubClient;
}


// subscriber client 
let subClient = null;
export const redisSub = async () => {
    if (!subClient) {
        subClient = createClient({ url: process.env.REDIS_URL });

        subClient.on("connect", () => {
            console.log("Redis Sub connected");
        });

        subClient.on("error", (error) => {
            console.error('Redis Sub error', error);
        })

        await subClient.connect();
    }
    return subClient;
}

export default redisClient;