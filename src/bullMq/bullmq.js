import dotenv from 'dotenv';

dotenv.config();

export const bullConnection = process.env.REDIS_URL 
    ? { url: process.env.REDIS_URL }
    : { host: "127.0.0.1", port: 6379 };



export const defaultJobOptions = {
    attempts: 8,                                    // robust retry
    backoff: { type: "exponential", delay: 1000 },  // 1s, 2s, 4s, ...
    removeOnComplete: { age: 60 * 60, count: 1000 },// keep for 1h or 1000
    removeOnFail: { age: 24 * 60 * 60 },            // keep failed for 24h
    timeout: 30_000,                                 // avoid stuck jobs
    };