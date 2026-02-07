import redis from '#config/connection/nosql/redis.js';

export const setWithTTL = async (key: string, value: string, ttl: number): Promise<void> => {
   await redis.set(key, value, 'EX', ttl);
};

export const setNXWithTTL = async (key: string, value: string, ttl: number): Promise<boolean> => {
   const result = await redis.set(key, value, 'EX', ttl, 'NX');
   return result === 'OK';
};

export const incrementWithTTL = async (key: string, ttl: number): Promise<number> => {
   const val = await redis.incr(key);
   if (val === 1) {
      await redis.expire(key, ttl);
   }
   return val;
};

export const getTTL = async (key: string): Promise<number> => {
   return redis.ttl(key);
};

export const get = async (key: string): Promise<string | null> => {
   return redis.get(key);
};

export const del = async (key: string): Promise<void> => {
   await redis.del(key);
};

export const sAdd = async (key: string, member: string): Promise<void> => {
   await redis.sadd(key, member);
};

export const sMembers = async (key: string): Promise<string[]> => {
   return redis.smembers(key);
};

export const sRem = async (key: string, member: string): Promise<void> => {
   await redis.srem(key, member);
};

export const expire = async (key: string, ttl: number): Promise<void> => {
   await redis.expire(key, ttl);
};
