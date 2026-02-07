import { REDIS_PREFIX } from '#common/constants/index.const.js';
import { hashTokenForRedis } from '#common/utils/security/token.js';
import env from '#config/env.js';
import * as redisService from '#infra/cache/redis.service.js';
import type { SessionData } from '#modules/auth/signin/signin.service.js';
import * as sessionRepository from '#modules/session/session.repository.js';

export const logout = async (token: string, userId: string): Promise<void> => {
   const tokenHash = hashTokenForRedis(token);
   const sessionKey = `${REDIS_PREFIX.SESSION}${tokenHash}`;

   const raw = await redisService.get(sessionKey);
   if (raw) {
      const session = JSON.parse(raw) as SessionData;
      void sessionRepository.revokeSession(session.sessionId);
   }

   await redisService.del(sessionKey);
   await redisService.sRem(`${REDIS_PREFIX.USER_SESSIONS}${userId}`, sessionKey);
};

export const logoutAll = async (userId: string): Promise<void> => {
   const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${userId}`;
   const sessionKeys = await redisService.sMembers(userSessionsKey);
   for (const sessionKey of sessionKeys) await redisService.del(sessionKey);
   await redisService.del(userSessionsKey);
   await sessionRepository.revokeAllUserSessions(userId);

   const genKey = `${REDIS_PREFIX.SESSION_GENERATION}${userId}`;
   const currentGen = await redisService.get(genKey);
   const newGen = (currentGen ? Number(currentGen) : 0) + 1;
   await redisService.setWithTTL(genKey, newGen.toString(), env.SESSION_TTL);
};

export const listSessions = async (
   userId: string,
   currentToken: string,
): Promise<(SessionData & { isCurrent: boolean })[]> => {
   const currentTokenHash = hashTokenForRedis(currentToken);
   const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${userId}`;
   const sessionKeys = await redisService.sMembers(userSessionsKey);
   const sessions: (SessionData & { isCurrent: boolean })[] = [];
   const staleKeys: string[] = [];

   for (const key of sessionKeys) {
      const raw = await redisService.get(key);
      if (raw) {
         const parsedSession = JSON.parse(raw) as SessionData;
         sessions.push({
            ...parsedSession,
            isCurrent: key === `${REDIS_PREFIX.SESSION}${currentTokenHash}`,
         });
      } else {
         staleKeys.push(key);
      }
   }

   for (const staleKey of staleKeys) {
      await redisService.sRem(userSessionsKey, staleKey);
   }

   if (sessions.length > 0) {
      await redisService.expire(userSessionsKey, env.SESSION_TTL);
   }

   return sessions.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
};

export const logoutSpecific = async (userId: string, targetSessionId: string): Promise<void> => {
   const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${userId}`;
   const sessionKeys = await redisService.sMembers(userSessionsKey);

   for (const key of sessionKeys) {
      const raw = await redisService.get(key);
      if (raw) {
         const parsed = JSON.parse(raw) as SessionData;
         if (parsed.sessionId === targetSessionId) {
            await redisService.del(key);
            await redisService.sRem(userSessionsKey, key);
            await sessionRepository.revokeSession(targetSessionId);
            return;
         }
      }
   }
};
