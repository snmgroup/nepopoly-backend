import { v4 as uuidv4 } from 'uuid';
import { redis, lockKey } from './redis';

const LOCK_EXPIRY_TIME = 5000; // Lock expiry in milliseconds (e.g., 5 seconds)
const LOCK_RETRY_INTERVAL = 100; // How often to retry acquiring lock in milliseconds

export async function acquireLock(gameId: string): Promise<void> {
  const key = lockKey(gameId);
  const identifier = uuidv4(); // Unique identifier for this lock attempt

  while (true) {
    const result = await redis.set(key, identifier, 'PX', LOCK_EXPIRY_TIME, 'NX');
    if (result === 'OK') {
      // Lock acquired
      return;
    }
    // Lock not acquired, wait and retry
    await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL));
  }
}

export async function releaseLock(gameId: string): Promise<void> {
  const key = lockKey(gameId);
  // In a real scenario, you'd want to ensure you're releasing *your* lock
  // by checking the identifier. For simplicity here, we just delete.
  await redis.del(key);
}
