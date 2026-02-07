import { randomBytes } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { REDIS_PREFIX, SESSION_TOKEN_COOKIE } from '#common/constants/index.const.js';
import { eventService } from '#common/services/event.service.js';
import { hashTokenForRedis } from '#common/utils/security/token.js';
import redis, { redisSubscriber } from '#config/connection/nosql/redis.js';
import env from '#config/env.js';
import * as redisService from '#infra/cache/redis.service.js';

interface SSEConnection {
   reply: FastifyReply;
   connectionId: string;
   sessionId: string | null;
   tokenHash: string;
   userId: string;
   heartbeat: ReturnType<typeof setInterval>;
   revalidation: ReturnType<typeof setInterval>;
}

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_INTERVAL = 15_000;
const REVALIDATION_INTERVAL = 60_000;
const ACTIVE_SESSIONS_PREFIX = 'presence_hash:';

const connections = new Map<string, Set<SSEConnection>>();

const subscriptionRefCount = new Map<string, number>();

const safeWrite = (conn: SSEConnection, data: string): boolean => {
   try {
      if (conn.reply.raw.destroyed || conn.reply.raw.writableEnded) {
         return false;
      }
      conn.reply.raw.write(data);
      return true;
   } catch {
      return false;
   }
};

const removeConnection = (conn: SSEConnection): void => {
   clearInterval(conn.heartbeat);
   clearInterval(conn.revalidation);

   const userConns = connections.get(conn.userId);
   if (userConns) {
      userConns.delete(conn);
      if (userConns.size === 0) {
         connections.delete(conn.userId);
      }
   }

   const channel = `user_events:${conn.userId}`;
   const currentCount = (subscriptionRefCount.get(channel) ?? 1) - 1;
   if (currentCount <= 0) {
      subscriptionRefCount.delete(channel);
      void redisSubscriber.unsubscribe(channel);
   } else {
      subscriptionRefCount.set(channel, currentCount);
   }

   if (conn.connectionId) {
      const activeKey = `${ACTIVE_SESSIONS_PREFIX}${conn.userId}`;
      void redis.hdel(activeKey, conn.connectionId).then(async () => {
         const remaining = await redis.hlen(activeKey);
         if (remaining === 0) {
            await redis.del(activeKey);
         }
         void eventService.publishToUser(conn.userId, { type: 'PRESENCE_UPDATE' });
      });
   }

   if (!conn.reply.raw.destroyed) {
      conn.reply.raw.end();
   }
};

redisSubscriber.on('message', (channel, message) => {
   if (!channel.startsWith('user_events:')) return;

   const userId = channel.split(':')[1];
   const userConns = connections.get(userId);
   if (!userConns) return;

   const dead: SSEConnection[] = [];
   for (const conn of userConns) {
      if (!safeWrite(conn, `data: ${message}\n\n`)) {
         dead.push(conn);
      }
   }

   for (const conn of dead) {
      removeConnection(conn);
   }
});

const startRevalidation = (conn: SSEConnection): ReturnType<typeof setInterval> => {
   return setInterval(() => {
      void (async () => {
         const sessionKey = `${REDIS_PREFIX.SESSION}${conn.tokenHash}`;
         const exists = await redisService.get(sessionKey);
         if (!exists) {
            safeWrite(conn, `data: ${JSON.stringify({ type: 'SESSION_EXPIRED' })}\n\n`);
            removeConnection(conn);
         }
      })();
   }, REVALIDATION_INTERVAL);
};

void redisSubscriber.punsubscribe('user_events:*');

export default function sessionStreamRoutes(app: FastifyInstance) {
   app.get('/session-stream', async (request, reply) => {
      const userId = request.user?.userId;
      if (!userId) {
         return reply.status(401).send({ message: 'Unauthorized' });
      }

      const existing = connections.get(userId);
      if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
         return reply.status(429).send({
            message: `Maximum ${String(MAX_CONNECTIONS_PER_USER)} concurrent connections allowed`,
         });
      }

      const tokenHash = (() => {
         const cookieValue = request.cookies[SESSION_TOKEN_COOKIE];
         if (!cookieValue) return '';
         const unsigned = request.unsignCookie(cookieValue);
         if (!unsigned.valid || !unsigned.value) return '';
         return hashTokenForRedis(unsigned.value);
      })();

      const sessionKey = `${REDIS_PREFIX.SESSION}${tokenHash}`;
      const rawSession = await redisService.get(sessionKey);
      const sessionId = rawSession
         ? (JSON.parse(rawSession) as { sessionId: string }).sessionId
         : null;

      const connectionId = randomBytes(8).toString('hex');

      void reply.hijack();

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');

      const origin = request.headers.origin ?? env.CORS_ORIGIN;
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');

      reply.raw.flushHeaders();

      const conn: SSEConnection = {
         reply,
         connectionId,
         sessionId,
         tokenHash,
         userId,
         heartbeat: null as unknown as ReturnType<typeof setInterval>,
         revalidation: null as unknown as ReturnType<typeof setInterval>,
      };

      conn.heartbeat = setInterval(() => {
         if (!safeWrite(conn, ':\n\n')) {
            removeConnection(conn);
         }
      }, HEARTBEAT_INTERVAL);

      conn.revalidation = startRevalidation(conn);

      if (!connections.has(userId)) {
         connections.set(userId, new Set());
      }
      connections.get(userId)?.add(conn);

      const channel = `user_events:${userId}`;
      const currentCount = subscriptionRefCount.get(channel) ?? 0;
      if (currentCount === 0) {
         await redisSubscriber.subscribe(channel);
      }
      subscriptionRefCount.set(channel, currentCount + 1);

      const activeKey = `${ACTIVE_SESSIONS_PREFIX}${userId}`;
      if (sessionId) {
         await redis.hset(activeKey, connectionId, sessionId);
         await redis.expire(activeKey, 86400);
      }
      void eventService.publishToUser(userId, { type: 'PRESENCE_UPDATE' });

      safeWrite(
         conn,
         `data: ${JSON.stringify({ type: 'CONNECTED', sessionId, connectionId })}\n\n`,
      );

      reply.raw.on('error', () => {
         removeConnection(conn);
      });

      request.raw.on('close', () => {
         removeConnection(conn);
      });
   });
}
