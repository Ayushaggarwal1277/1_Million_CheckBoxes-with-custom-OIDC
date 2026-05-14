import {Redis} from 'ioredis';


const newRedisConnection = () => new Redis({
    host: 'localhost',
    port: 6379,
})

export const publisher = newRedisConnection();

export const subscriber = newRedisConnection();