import { AppError } from '#common/errors/appError.js';
import { encrypt } from '#common/utils/security/encryption.js';
import env from '#config/env.js';
import logger from '#common/utils/logger.js';
import * as redisService from '#infra/cache/redis.service.js';

import { addEmailJob } from './email.queue.js';

const EMAIL_RATE_LIMIT_TTL = 180;

export const checkEmailRateLimit = async (email: string): Promise<void> => {
   const key = `email_limit:${email}`;
   const ok = await redisService.setNXWithTTL(key, '1', EMAIL_RATE_LIMIT_TTL);

   if (!ok) {
      const remainingSeconds = await redisService.getTTL(key);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;

      const timeStr =
         minutes > 0 ? `${String(minutes)}m ${String(seconds)}s` : `${String(seconds)}s`;
      throw new AppError(
         `Too many requests. Please wait ${timeStr} before requesting another email.`,
         429,
      );
   }
};

export const sendOtp = (email: string, otp: string, expiryMinutes = 5): void => {
   void (async () => {
      try {
         const encryptedOtp = await encrypt(otp);
         await addEmailJob({
            type: 'otp',
            to: email,
            otp: encryptedOtp,
            expiryMinutes,
            subject: `${env.APP_NAME} — Your Verification Code`,
         });
      } catch (err) {
         logger.error({ err }, 'Failed to schedule verification email.');
      }
   })();
};

export const sendPasswordReset = (email: string, otp: string, resetLink: string): void => {
   void (async () => {
      try {
         const encryptedOtp = await encrypt(otp);
         const encryptedLink = await encrypt(resetLink);
         await addEmailJob({
            type: 'password-reset',
            to: email,
            otp: encryptedOtp,
            resetLink: encryptedLink,
            subject: `${env.APP_NAME} — Reset Your Password`,
         });
      } catch (err) {
         logger.error({ err }, 'Failed to schedule password recovery email.');
      }
   })();
};
