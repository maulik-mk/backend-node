import { Redis } from 'ioredis';

import env from '#config/env.js';

const redis = new Redis(env.REDIS_URL, {
   maxRetriesPerRequest: 3,
   retryStrategy(times: number) {
      const delay = Math.min(times * 200, 2000);
      return delay;
   },
   tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
});

export const redisPublisher = new Redis(env.REDIS_URL, {
   maxRetriesPerRequest: 3,
   retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
   },
   tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
});

export const redisSubscriber = new Redis(env.REDIS_URL, {
   maxRetriesPerRequest: 3,
   retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
   },
   tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
});

export default redis;
