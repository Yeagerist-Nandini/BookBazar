import { createClient } from "redis"

let client = null;

const redisClient = async() => {
    if(!client){
        client = createClient({url: process.env.REDIS_URL});

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

export default redisClient;