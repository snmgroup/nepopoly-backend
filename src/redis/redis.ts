import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new Redis(REDIS_URL,{maxRetriesPerRequest: null,});

export const gameKey = (gameId:string) => `game:${gameId}`;
export const gameEventsKey = (gameId:string) => `events:${gameId}`;
export const lockKey = (gameId:string) => `lock:${gameId}`;

export async function setRedisJson<T>(key: string, field: string, value: T): Promise<number> {
    return redis.hset(key, field, JSON.stringify(value));
}

export async function getRedisJson<T>(key: string, field: string): Promise<T | null> {
    const data = await redis.hget(key, field);
    return data ? JSON.parse(data) as T : null;
}

export async function deleteRedisJson(key: string, field: string): Promise<number> {
    return redis.hdel(key, field);
}
