import { createHash } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import {
   DEVICE_ID_COOKIE,
   REDIS_PREFIX,
   ROTATED_TOKEN_GRACE_PERIOD,
   SESSION_STRICT_COOKIE,
   SESSION_TOKEN_COOKIE,
   TOKEN_ROTATION_INTERVAL,
} from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { sessionCookieOpts, sessionStrictCookieOpts } from '#common/utils/security/cookie.js';
import {
   generateSessionToken,
   hashTokenForRedis,
   verifyTokenChecksum,
} from '#common/utils/security/token.js';
import env from '#config/env.js';
import * as redisService from '#infra/cache/redis.service.js';
import type { SessionData } from '#modules/auth/signin/signin.service.js';

declare module 'fastify' {
   interface FastifyRequest {
      user?: {
         userId: string;
         publicId: string;
         email: string;
         username: string;
      };
      sessionToken?: string;
   }
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
   const cookieValue = request.cookies[SESSION_TOKEN_COOKIE];

   if (!cookieValue) {
      throw new AppError('Authentication is required. Please sign in to continue.', 401);
   }

   const tokenParams = request.unsignCookie(cookieValue);

   if (!tokenParams.valid || !tokenParams.value) {
      throw new AppError('Your session is invalid. Please sign in again.', 401);
   }

   const token = tokenParams.value;

   if (!verifyTokenChecksum(token)) {
      request.log.warn({ ip: request.ip }, 'Detected malformed or spoofed session token');
      throw new AppError('Your session is invalid. Please sign in again.', 401);
   }

   const tokenHash = hashTokenForRedis(token);
   let sessionKey = `${REDIS_PREFIX.SESSION}${tokenHash}`;
   let rawSession = await redisService.get(sessionKey);

   if (!rawSession) {
      const rotatedKey = `${REDIS_PREFIX.ROTATED_SESSION}${tokenHash}`;
      const newTokenHash = await redisService.get(rotatedKey);
      if (newTokenHash) {
         sessionKey = `${REDIS_PREFIX.SESSION}${newTokenHash}`;
         rawSession = await redisService.get(sessionKey);
      }
   }

   if (!rawSession) {
      throw new AppError('Your session has expired. Please sign in again.', 401);
   }

   const session = JSON.parse(rawSession) as SessionData;

   if (Date.now() > session.absoluteExpiresAt) {
      await redisService.del(sessionKey);
      const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${session.userId}`;
      await redisService.sRem(userSessionsKey, sessionKey);
      throw new AppError('Your session has expired. Please sign in again.', 401);
   }

   const genKey = `${REDIS_PREFIX.SESSION_GENERATION}${session.userId}`;
   const currentGen = await redisService.get(genKey);
   if (currentGen && Number(currentGen) > session.generation) {
      await redisService.del(sessionKey);
      const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${session.userId}`;
      await redisService.sRem(userSessionsKey, sessionKey);
      throw new AppError('Your session has been invalidated. Please sign in again.', 401);
   }

   if (STATE_CHANGING_METHODS.has(request.method)) {
      const strictCookie = request.cookies[SESSION_STRICT_COOKIE];
      if (strictCookie) {
         const strictParams = request.unsignCookie(strictCookie);
         if (!strictParams.valid || strictParams.value !== token) {
            request.log.warn(
               { ip: request.ip },
               'CSRF: session_token and strict cookie mismatch — possible cross-origin attack',
            );
            throw new AppError('Security validation failed. Please try again.', 403);
         }
      }
   }

   if (session.uaHash) {
      const currentUaHash = createHash('sha256')
         .update(request.headers['user-agent'] ?? '')
         .digest('hex')
         .slice(0, 16);

      if (session.uaHash !== currentUaHash) {
         request.log.warn(
            {
               ip: request.ip,
               sessionIp: session.ip,
               expectedUa: session.uaHash,
               actualUa: currentUaHash,
            },
            'Potential session hijacking: user-agent fingerprint mismatch',
         );

         if (STATE_CHANGING_METHODS.has(request.method)) {
            await redisService.del(sessionKey);
            throw new AppError(
               'Your session has been terminated for security reasons. Please sign in again.',
               401,
            );
         }
      }
   }

   if (session.deviceId) {
      const deviceCookie = request.cookies[DEVICE_ID_COOKIE];
      if (deviceCookie) {
         const deviceParams = request.unsignCookie(deviceCookie);
         if (deviceParams.valid && deviceParams.value !== session.deviceId) {
            request.log.warn(
               {
                  ip: request.ip,
                  expectedDevice: session.deviceId,
                  actualDevice: deviceParams.value,
               },
               'Device ID mismatch — possible session token theft',
            );

            if (STATE_CHANGING_METHODS.has(request.method)) {
               await redisService.del(sessionKey);
               throw new AppError(
                  'For your security, your session has been ended. Please sign in again.',
                  401,
               );
            }
         }
      }
   }

   if (session.ip && session.ip !== request.ip) {
      request.log.warn(
         { sessionIp: session.ip, currentIp: request.ip },
         'Session IP changed - possible session migration',
      );
   }

   session.lastAccessedAt = Date.now();
   await redisService.setWithTTL(sessionKey, JSON.stringify(session), env.SESSION_IDLE_TTL);

   const timeSinceRotation = Date.now() - session.lastRotatedAt;
   if (timeSinceRotation > TOKEN_ROTATION_INTERVAL * 1000) {
      const newToken = generateSessionToken();
      const newTokenHash = hashTokenForRedis(newToken);
      const newSessionKey = `${REDIS_PREFIX.SESSION}${newTokenHash}`;

      session.lastRotatedAt = Date.now();
      await redisService.setWithTTL(newSessionKey, JSON.stringify(session), env.SESSION_IDLE_TTL);

      const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${session.userId}`;
      await redisService.sRem(userSessionsKey, sessionKey);
      await redisService.sAdd(userSessionsKey, newSessionKey);

      const rotatedPointerKey = `${REDIS_PREFIX.ROTATED_SESSION}${tokenHash}`;
      await redisService.setWithTTL(rotatedPointerKey, newTokenHash, ROTATED_TOKEN_GRACE_PERIOD);

      await redisService.del(sessionKey);

      reply.setCookie(SESSION_TOKEN_COOKIE, newToken, sessionCookieOpts(env));
      reply.setCookie(SESSION_STRICT_COOKIE, newToken, sessionStrictCookieOpts(env));

      request.sessionToken = newToken;
   } else {
      request.sessionToken = token;
   }

   request.user = {
      userId: session.userId,
      publicId: session.publicId,
      email: session.email,
      username: session.username,
   };
};
