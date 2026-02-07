import { createHash } from 'node:crypto';

import bcrypt from 'bcrypt';
import { UAParser } from 'ua-parser-js';

import {
   LOCKOUT_TTL,
   MAX_FAILED_LOGINS,
   MAX_SESSIONS_PER_USER,
   REDIS_PREFIX,
} from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { eventService } from '#common/services/event.service.js';
import { generateSessionToken, hashTokenForRedis } from '#common/utils/security/token.js';
import { isAllowedDomain, normalizeEmail } from '#common/utils/security/validation.js';
import { generateId } from '#common/utils/snowflake.js';
import env from '#config/env.js';
import type { AuthUserRow } from '#database/models/user.model.js';
import * as redisService from '#infra/cache/redis.service.js';
import { getGeoLocation } from '#infra/geolocation/ipinfo.service.js';
import { logEventAsync } from '#modules/audit/audit.repository.js';
import { recordAttemptAsync } from '#modules/auth/loginAttempt.repository.js';
import * as signinRepository from '#modules/auth/signin/signin.repository.js';
import type { SigninDTO } from '#modules/auth/signin/signin.schema.js';
import * as sessionRepository from '#modules/session/session.repository.js';
import * as userRepository from '#modules/user/user.repository.js';

export interface SessionData {
   sessionId: string;
   userId: string;
   publicId: string;
   email: string;
   username: string;
   deviceId: string;
   browser: string;
   os: string;
   deviceType: string;
   ip: string;
   location: string;
   createdAt: number;
   lastAccessedAt: number;
   lastRotatedAt: number;
   absoluteExpiresAt: number;
   generation: number;
   latitude?: number;
   longitude?: number;
   uaHash: string;
}

const computeUaHash = (userAgent: string): string => {
   return createHash('sha256').update(userAgent).digest('hex').slice(0, 16);
};

const getSessionGeneration = async (userId: string): Promise<number> => {
   const genKey = `${REDIS_PREFIX.SESSION_GENERATION}${userId}`;
   const val = await redisService.get(genKey);
   return val ? Number(val) : 0;
};

const enforceMaxSessions = async (userId: string): Promise<void> => {
   const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${userId}`;
   const sessionKeys = await redisService.sMembers(userSessionsKey);

   if (sessionKeys.length < MAX_SESSIONS_PER_USER) return;

   let oldest: { key: string; lastAccessed: number } | null = null;

   for (const key of sessionKeys) {
      const raw = await redisService.get(key);
      if (!raw) {
         await redisService.sRem(userSessionsKey, key);
         continue;
      }
      const session = JSON.parse(raw) as SessionData;
      if (!oldest || session.lastAccessedAt < oldest.lastAccessed) {
         oldest = { key, lastAccessed: session.lastAccessedAt };
      }
   }

   if (oldest) {
      const raw = await redisService.get(oldest.key);
      if (raw) {
         const session = JSON.parse(raw) as SessionData;
         void sessionRepository.revokeSession(session.sessionId);
      }
      await redisService.del(oldest.key);
      await redisService.sRem(userSessionsKey, oldest.key);
   }
};

const parseDevice = (userAgentString: string) => {
   const parser = new UAParser(userAgentString);
   return {
      browser:
         `${parser.getBrowser().name ?? 'Unknown'} ${parser.getBrowser().version ?? ''}`.trim(),
      os: `${parser.getOS().name ?? 'Unknown'} ${parser.getOS().version ?? ''}`.trim(),
      deviceType: parser.getDevice().type ?? 'desktop',
   };
};

const createSessionForUser = async (
   user: AuthUserRow,
   userAgentString: string,
   ip: string,
   deviceId: string,
   geo: { latitude?: number | null; longitude?: number | null; locationString?: string },
): Promise<{
   token: string;
   publicId: string;
   username: string;
   email: string;
   deliveryEmail: string | null;
   firstName: string;
   lastName: string;
   avatarId: string | null;
   isTwoFactorEnabled: boolean;
}> => {
   await enforceMaxSessions(user.id);

   const token = generateSessionToken();
   const tokenHash = hashTokenForRedis(token);
   const sessionId = generateId();
   const { browser, os, deviceType } = parseDevice(userAgentString);
   const generation = await getSessionGeneration(user.id);

   const now = Date.now();

   const sessionData: SessionData = {
      sessionId,
      userId: user.id,
      publicId: user.public_id,
      email: user.email,
      username: user.username,
      deviceId,
      browser,
      os,
      deviceType,
      ip,
      location: geo.locationString ?? 'Unknown Location',
      latitude: geo.latitude ?? undefined,
      longitude: geo.longitude ?? undefined,
      createdAt: now,
      lastAccessedAt: now,
      lastRotatedAt: now,
      absoluteExpiresAt: now + env.SESSION_TTL * 1000,
      generation,
      uaHash: computeUaHash(userAgentString),
   };

   const sessionKey = `${REDIS_PREFIX.SESSION}${tokenHash}`;
   await redisService.setWithTTL(sessionKey, JSON.stringify(sessionData), env.SESSION_IDLE_TTL);

   const userSessionsKey = `${REDIS_PREFIX.USER_SESSIONS}${user.id}`;
   await redisService.sAdd(userSessionsKey, sessionKey);
   await redisService.expire(userSessionsKey, env.SESSION_TTL);

   void sessionRepository.createSession({
      sessionId,
      userId: user.id,
      token,
      ipAddress: ip,
      browser,
      os,
      deviceType,
      location: geo.locationString ?? 'Unknown Location',
      latitude: geo.latitude ?? undefined,
      longitude: geo.longitude ?? undefined,
      expiresAt: new Date(now + env.SESSION_TTL * 1000),
   });

   await eventService.publishToUser(user.id, { type: 'NEW_SESSION' });

   return {
      token,
      publicId: user.public_id,
      username: user.username,
      email: user.email,
      deliveryEmail: user.delivery_email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarId: user.avatar_id,
      isTwoFactorEnabled: user.is_two_factor_enabled,
   };
};

export const login = async (
   payload: SigninDTO,
   userAgentString: string,
   ip: string,
   deviceId: string,
) => {
   const deviceMeta = parseDevice(userAgentString);

   let identifier = payload.identifier.trim();
   if (identifier.includes('@')) {
      const { canonical } = normalizeEmail(identifier);
      identifier = canonical;
      if (!isAllowedDomain(canonical))
         throw new AppError('Invalid credentials. Please check your details and try again.', 401);
   }

   const user = await signinRepository.findByEmailOrUsername(identifier);
   if (!user) {
      recordAttemptAsync({
         identifier,
         ipAddress: ip,
         success: false,
         failureReason: 'USER_NOT_FOUND',
         metadata: deviceMeta,
      });
      throw new AppError('Invalid credentials. Please check your details and try again.', 401);
   }

   const lockoutKey = `${REDIS_PREFIX.LOCKOUT}${user.public_id}`;
   if (await redisService.get(lockoutKey)) {
      recordAttemptAsync({
         userId: user.id,
         identifier,
         ipAddress: ip,
         success: false,
         failureReason: 'ACCOUNT_LOCKED',
         metadata: deviceMeta,
      });
      throw new AppError(
         'This account has been temporarily locked due to multiple failed login attempts. Please try again later.',
         401,
      );
   }

   const isValidPassword = await bcrypt.compare(payload.password, user.password_hash);
   if (!isValidPassword) {
      const failures =
         Number((await redisService.get(`${REDIS_PREFIX.FAILED_LOGINS}${user.public_id}`)) ?? 0) +
         1;

      if (failures >= MAX_FAILED_LOGINS) {
         await redisService.setWithTTL(lockoutKey, 'locked', LOCKOUT_TTL);
         logEventAsync({
            userId: user.id,
            action: 'user.account_locked',
            ipAddress: ip,
         });
      }

      await redisService.setWithTTL(
         `${REDIS_PREFIX.FAILED_LOGINS}${user.public_id}`,
         failures.toString(),
         900,
      );

      recordAttemptAsync({
         userId: user.id,
         identifier,
         ipAddress: ip,
         success: false,
         failureReason: 'INVALID_PASSWORD',
         metadata: deviceMeta,
      });
      throw new AppError('Invalid credentials. Please check your details and try again.', 401);
   }

   await redisService.del(`${REDIS_PREFIX.FAILED_LOGINS}${user.public_id}`);

   if (user.status !== 'active') {
      if (user.status === 'pending_verification')
         throw new AppError(
            'Please complete the email verification process before signing in.',
            403,
         );
      if (user.status === 'locked')
         throw new AppError(
            'This account has been locked. Please contact support for assistance.',
            401,
         );
      if (user.status === 'suspended')
         throw new AppError(
            'This account has been suspended. Please contact support for further information.',
            403,
         );
      throw new AppError('This account is currently inactive. Please contact support.', 403);
   }

   if (user.is_two_factor_enabled) {
      const twoFaSessionId = generateId();
      const loginAttemptKey = `${REDIS_PREFIX.LOGIN_2FA}${twoFaSessionId}`;
      await redisService.setWithTTL(
         loginAttemptKey,
         JSON.stringify({ userId: user.id, userAgentString, ip, deviceId }),
         300,
      );
      return { requires2FA: true, sessionId: twoFaSessionId };
   }

   const geo = await getGeoLocation(ip);
   const session = await createSessionForUser(user, userAgentString, ip, deviceId, geo);
   const location = geo.locationString ?? 'Unknown Location';

   recordAttemptAsync({
      userId: user.id,
      identifier,
      ipAddress: ip,
      success: true,
      metadata: { ...deviceMeta, location },
   });
   logEventAsync({
      userId: user.id,
      action: 'auth.login_success',
      ipAddress: ip,
      metadata: { ...deviceMeta, location },
   });

   return {
      token: session.token,
      user: session,
   };
};

export const verify2FALogin = async (sessionId: string, token: string, deviceId: string) => {
   const loginAttemptKey = `${REDIS_PREFIX.LOGIN_2FA}${sessionId}`;
   const raw = await redisService.get(loginAttemptKey);
   if (!raw) throw new AppError('The sign-in session has expired. Please try again.', 400);

   const { userId, userAgentString, ip } = JSON.parse(raw) as {
      userId: string;
      userAgentString: string;
      ip: string;
      deviceId?: string;
   };
   const user = await userRepository.findAuthDataById(userId);
   if (!user?.two_factor_secret)
      throw new AppError('The sign-in request is invalid or has expired.', 400);

   const isValid = await userRepository.verifyTwoFactorToken(userId, token);
   if (!isValid) throw new AppError('The verification code provided is invalid.', 400);

   await redisService.del(loginAttemptKey);

   const geo = await getGeoLocation(ip);
   const session = await createSessionForUser(user, userAgentString, ip, deviceId, geo);
   const location = geo.locationString ?? 'Unknown Location';
   const deviceMeta = parseDevice(userAgentString);

   recordAttemptAsync({
      userId: user.id,
      identifier: user.email,
      ipAddress: ip,
      success: true,
      metadata: { ...deviceMeta, location },
   });
   logEventAsync({
      userId: user.id,
      action: 'auth.login_success_2fa',
      ipAddress: ip,
      metadata: { ...deviceMeta, location },
   });

   return {
      token: session.token,
      user: session,
   };
};
