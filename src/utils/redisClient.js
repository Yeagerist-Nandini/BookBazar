import { error } from "console";
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


// publisher client 
export const redisPub = async() => {
    const client = createClient({url: process.env.REDIS_URL});

    client.on("connect", () => {
        console.log("Redis Pub connected");
    });

    client.on("error", (error) => {
        console.error('Redis pub error', error);
    })
}


// subscriber client 
export const rediSub = async() => {
    const client = createClient({url: process.env.REDIS_URL});

    client.on("connect", () => {
        console.log("Redis Sub connected");
    });

    client.on("error", (error) => {
        console.error('Redis Sub error', error);
    })
}

export default redisClient;