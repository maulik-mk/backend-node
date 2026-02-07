import { redisPublisher } from '#config/connection/nosql/redis.js';

export interface RealtimeEventPayload {
   type: 'SESSION_REVOKED' | 'NEW_SESSION' | 'PRESENCE_UPDATE';
   sessionId?: string;
   metadata?: Record<string, unknown>;
}

export const eventService = {
   publishToUser: async (userId: string, payload: RealtimeEventPayload) => {
      const channel = `user_events:${userId}`;
      await redisPublisher.publish(channel, JSON.stringify(payload));
   },

   publishGlobal: async (payload: RealtimeEventPayload) => {
      await redisPublisher.publish('system_events', JSON.stringify(payload));
   },
};
