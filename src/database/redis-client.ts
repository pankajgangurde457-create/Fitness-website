import { createClient } from 'redis';

let useMock = false;
let client: any = null;
const mockStore: Record<string, string> = {};
const mockQueues: Record<string, string[]> = {};

export async function initRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  if (process.env.NODE_ENV === 'test') {
    useMock = true;
    console.log('Redis Client: Running in test mode, using in-memory mock store.');
    return;
  }

  try {
    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 1) {
            // Fail fast and return false to stop reconnecting
            return false;
          }
          return 200; // retry once after 200ms
        }
      }
    });
    client.on('error', (err: any) => {
      // Don't log spam if it's disconnected, just fallback
    });

    await client.connect();
    console.log('Redis Client: Connected to Redis server.');
  } catch (error) {
    console.warn('Redis Client: Failed to connect to Redis. Falling back to local in-memory store.');
    useMock = true;
  }
}

export async function cacheSet(key: string, value: string, expireSeconds?: number): Promise<void> {
  if (useMock) {
    mockStore[key] = value;
    return;
  }
  
  if (expireSeconds) {
    await client.set(key, value, { EX: expireSeconds });
  } else {
    await client.set(key, value);
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (useMock) {
    return mockStore[key] || null;
  }
  return await client.get(key);
}

export async function cacheDel(key: string): Promise<void> {
  if (useMock) {
    delete mockStore[key];
    return;
  }
  await client.del(key);
}

export async function queuePush(queueName: string, item: string): Promise<number> {
  if (useMock) {
    if (!mockQueues[queueName]) {
      mockQueues[queueName] = [];
    }
    mockQueues[queueName].push(item);
    return mockQueues[queueName].length;
  }
  return await client.rPush(queueName, item);
}

export async function queuePop(queueName: string): Promise<string | null> {
  if (useMock) {
    if (!mockQueues[queueName] || mockQueues[queueName].length === 0) {
      return null;
    }
    return mockQueues[queueName].shift() || null;
  }
  return await client.lPop(queueName);
}

export async function queueLength(queueName: string): Promise<number> {
  if (useMock) {
    return mockQueues[queueName] ? mockQueues[queueName].length : 0;
  }
  return await client.lLen(queueName);
}

export async function closeRedis() {
  if (client && !useMock) {
    await client.disconnect();
  }
}
