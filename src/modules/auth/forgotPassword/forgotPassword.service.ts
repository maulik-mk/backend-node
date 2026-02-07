import { createHmac } from 'node:crypto';

import { MAX_RESET_OTP_ATTEMPTS, REDIS_PREFIX } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { generateOtp, hashOtp, verifyOtp } from '#common/utils/otp.js';
import { timingSafeCompare } from '#common/utils/security/token.js';
import { isAllowedDomain, normalizeEmail } from '#common/utils/security/validation.js';
import { generateId } from '#common/utils/snowflake.js';
import env from '#config/env.js';
import * as redisService from '#infra/cache/redis.service.js';
import * as mailService from '#infra/mail/mail.service.js';
import { logEventAsync } from '#modules/audit/audit.repository.js';
import * as sessionService from '#modules/session/session.service.js';
import * as userRepository from '#modules/user/user.repository.js';

const OTP_SESSION_TTL = 300;
const LINK_TTL = 1800;

const signToken = (token: string): string => {
   const signature = createHmac('sha256', env.RESET_TOKEN_SECRET).update(token).digest('hex');
   return `${token}.${signature}`;
};

const verifySignature = (signedToken: string): string | null => {
   const dotIndex = signedToken.indexOf('.');
   if (dotIndex === -1) return null;

   const token = signedToken.slice(0, dotIndex);
   const signature = signedToken.slice(dotIndex + 1);
   if (!token || !signature) return null;

   const expectedSignature = createHmac('sha256', env.RESET_TOKEN_SECRET)
      .update(token)
      .digest('hex');

   return timingSafeCompare(signature, expectedSignature) ? token : null;
};

const hashResetToken = (token: string): string => {
   return createHmac('sha256', env.RESET_TOKEN_SECRET).update(token).digest('hex');
};

export const requestReset = async (email: string) => {
   const { canonical, delivery } = normalizeEmail(email);

   await mailService.checkEmailRateLimit(delivery);

   if (!isAllowedDomain(canonical))
      throw new AppError('The email domain provided is not permitted for account recovery.', 400);

   const user = await userRepository.findByEmail(canonical);

   const otpSessionId = generateId();

   if (!user) {
      return {
         message: 'If an account exists with this email, you will receive a reset link.',
         otpSessionId,
      };
   }

   logEventAsync({
      userId: user.id,
      action: 'user.password_reset_requested',
   });

   const otp = generateOtp();
   const otpKey = `${REDIS_PREFIX.PASSWORD_RESET_OTP}${otpSessionId}`;
   await redisService.setWithTTL(
      otpKey,
      JSON.stringify({ userId: user.id, otpHash: hashOtp(otp), email: canonical, attempts: 0 }),
      OTP_SESSION_TTL,
   );

   const resetLinkId = generateId();
   const signedLinkToken = signToken(resetLinkId);
   const hashedLinkId = hashResetToken(resetLinkId);
   const linkKey = `${REDIS_PREFIX.PASSWORD_RESET_LINK}${hashedLinkId}`;
   await redisService.setWithTTL(
      linkKey,
      JSON.stringify({ userId: user.id, email: canonical }),
      LINK_TTL,
   );

   const resetLink = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(signedLinkToken)}`;
   mailService.sendPasswordReset(delivery, otp, resetLink);

   return {
      message: 'If an account exists with this email, you will receive a reset link.',
      otpSessionId,
   };
};

export const verifyOTP = async (otpSessionId: string, otp: string) => {
   const otpKey = `${REDIS_PREFIX.PASSWORD_RESET_OTP}${otpSessionId}`;
   const raw = await redisService.get(otpKey);
   if (!raw) throw new AppError('The recovery session has expired or is invalid.', 400);

   const data = JSON.parse(raw) as {
      userId: string;
      otpHash: string;
      email: string;
      attempts: number;
      verified?: boolean;
   };

   if (data.attempts >= MAX_RESET_OTP_ATTEMPTS) {
      await redisService.del(otpKey);
      throw new AppError(
         'Too many verification attempts. Please request a new recovery code.',
         429,
      );
   }

   if (!verifyOtp(otp, data.otpHash)) {
      data.attempts += 1;
      await redisService.setWithTTL(otpKey, JSON.stringify(data), OTP_SESSION_TTL);
      throw new AppError('The verification code provided is invalid.', 400);
   }

   await redisService.setWithTTL(
      otpKey,
      JSON.stringify({ ...data, verified: true }),
      OTP_SESSION_TTL,
   );

   return { message: 'Verification code confirmed.' };
};

export const verifyLink = async (signedToken: string) => {
   const resetLinkId = verifySignature(signedToken);
   if (!resetLinkId) throw new AppError('The recovery link provided is invalid.', 400);

   const hashedLinkId = hashResetToken(resetLinkId);
   const linkKey = `${REDIS_PREFIX.PASSWORD_RESET_LINK}${hashedLinkId}`;
   const raw = await redisService.get(linkKey);
   if (!raw) throw new AppError('The recovery link has expired or is invalid.', 400);

   return { message: 'Recovery link verified.' };
};

export const resetPassword = async (token: string, passwordHash: string) => {
   let userId: string | null = null;
   let keyToDelete: string | null = null;

   const resetLinkId = verifySignature(token);
   if (resetLinkId) {
      const hashedLinkId = hashResetToken(resetLinkId);
      const linkKey = `${REDIS_PREFIX.PASSWORD_RESET_LINK}${hashedLinkId}`;
      const raw = await redisService.get(linkKey);
      if (raw) {
         userId = (JSON.parse(raw) as { userId: string }).userId;
         keyToDelete = linkKey;
      }
   }

   if (!userId) {
      const otpKey = `${REDIS_PREFIX.PASSWORD_RESET_OTP}${token}`;
      const raw = await redisService.get(otpKey);
      if (raw) {
         const data = JSON.parse(raw) as { userId: string; verified?: boolean };
         if (!data.verified)
            throw new AppError(
               'The verification process must be completed before resetting your password.',
               400,
            );
         userId = data.userId;
         keyToDelete = otpKey;
      }
   }

   if (!userId || !keyToDelete) {
      throw new AppError('The recovery token has expired or is invalid.', 400);
   }

   await userRepository.updatePassword(userId, passwordHash);
   await redisService.del(keyToDelete);

   await sessionService.logoutAll(userId);

   logEventAsync({ userId, action: 'user.password_reset_completed' });

   return { message: 'Your password has been successfully updated.' };
};
