import bcrypt from 'bcrypt';

import { BCRYPT_SALT_ROUNDS, REDIS_PREFIX } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { PASSWORD_REGEX } from '#common/schemas/index.schem.js';
import { generateOtp, hashOtp, verifyOtp } from '#common/utils/otp.js';
import { encrypt } from '#common/utils/security/encryption.js';
import {
   isAllowedDomain,
   normalizeEmail,
   sanitizeInput,
} from '#common/utils/security/validation.js';
import * as redisService from '#infra/cache/redis.service.js';
import * as mailService from '#infra/mail/mail.service.js';
import { logEventAsync } from '#modules/audit/audit.repository.js';
import * as twoFactorService from '#modules/auth/twoFactor.service.js';
import * as sessionService from '#modules/session/session.service.js';
import * as userRepository from '#modules/user/user.repository.js';

const PASSWORD_CHANGE_OTP_TTL = 600;
const TWO_FA_SETUP_TTL = 600;

export const requestPasswordChange = async (
   userId: string,
   email: string,
   ip: string,
): Promise<{ requires2FA: boolean }> => {
   await mailService.checkEmailRateLimit(email);

   const fullUser = await userRepository.findAuthDataById(userId);
   if (!fullUser) throw new AppError('The requested user account could not be found.', 404);

   if (fullUser.is_two_factor_enabled) {
      return { requires2FA: true };
   }

   const otp = generateOtp();
   const otpKey = `${REDIS_PREFIX.PASSWORD_CHANGE_OTP}${userId}`;
   await redisService.setWithTTL(otpKey, hashOtp(otp), PASSWORD_CHANGE_OTP_TTL);

   mailService.sendOtp(email, otp);

   logEventAsync({
      userId,
      action: 'user.password_change_otp_sent',
      ipAddress: ip,
   });

   return { requires2FA: false };
};

export const changePassword = async (
   userId: string,
   newPassword: string,
   code: string,
   ip: string,
): Promise<void> => {
   if (!PASSWORD_REGEX.test(newPassword)) {
      throw new AppError('The password provided does not meet security requirements.', 400);
   }

   const fullUser = await userRepository.findAuthDataById(userId);
   if (!fullUser) throw new AppError('The requested user account could not be found.', 404);

   const isReused = await userRepository.isPasswordInHistory(userId, newPassword);
   if (isReused) {
      throw new AppError('For security reasons, you cannot reuse a recent password.', 400);
   }

   if (fullUser.is_two_factor_enabled) {
      if (!fullUser.two_factor_secret)
         throw new AppError('Two-factor authentication settings not found.', 400);
      const isValid = await userRepository.verifyTwoFactorToken(userId, code);
      if (!isValid) throw new AppError('The verification code provided is invalid.', 400);
   } else {
      const otpKey = `${REDIS_PREFIX.PASSWORD_CHANGE_OTP}${userId}`;
      const storedHash = await redisService.get(otpKey);
      if (!storedHash) throw new AppError('The verification code has expired or is invalid.', 400);

      if (!verifyOtp(code, storedHash)) {
         throw new AppError('The verification code provided is invalid.', 400);
      }

      await redisService.del(otpKey);
   }

   const hash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
   await userRepository.updatePassword(userId, hash);

   await sessionService.logoutAll(userId);

   logEventAsync({
      userId,
      action: 'user.password_changed',
      ipAddress: ip,
   });
};

export const setup2FA = async (userId: string, email: string) => {
   const secret = twoFactorService.generateSecret();
   const qrCode = await twoFactorService.generateQrCode(email, secret);

   const setupKey = `${REDIS_PREFIX.TWO_FA_SETUP}${userId}`;
   await redisService.setWithTTL(setupKey, secret, TWO_FA_SETUP_TTL);

   return { secret, qrCode };
};

export const confirm2FA = async (userId: string, token: string, ip: string) => {
   const setupKey = `${REDIS_PREFIX.TWO_FA_SETUP}${userId}`;
   const pendingSecret = await redisService.get(setupKey);
   if (!pendingSecret)
      throw new AppError(
         'Authentication setup has expired. Please initiate the process again.',
         400,
      );

   const isValid = twoFactorService.verifyToken(token, pendingSecret);
   if (!isValid) throw new AppError('The verification code provided is invalid.', 400);

   const encryptedSecret = await encrypt(pendingSecret);
   await userRepository.updateTwoFactorSecret(userId, encryptedSecret);
   await userRepository.enableTwoFactor(userId);

   await redisService.del(setupKey);

   logEventAsync({
      userId,
      action: 'user.enable_2fa',
      ipAddress: ip,
   });
};

export const disable2FA = async (userId: string, token: string, ip: string) => {
   const isValid = await userRepository.verifyTwoFactorToken(userId, token);
   if (!isValid) throw new AppError('The verification code provided is invalid.', 400);

   await userRepository.disableTwoFactor(userId);

   logEventAsync({
      userId,
      action: 'user.disable_2fa',
      ipAddress: ip,
   });
};

export const updateName = async (
   userId: string,
   firstName: string,
   lastName: string,
   ip: string,
): Promise<void> => {
   const cleanFirst = sanitizeInput(firstName);
   const cleanLast = sanitizeInput(lastName);

   if (cleanFirst.length < 2 || cleanLast.length < 2) {
      throw new AppError('Full name must be at least 2 characters long.', 400);
   }

   const limitKey = `rate_limit:update_name:${userId}`;
   const attempts = await redisService.incrementWithTTL(limitKey, 1800);
   if (attempts > 2) {
      throw new AppError(
         'You can only change your name 2 times per 30 minutes. Please try again later.',
         429,
      );
   }

   await userRepository.updateName(userId, cleanFirst, cleanLast);

   logEventAsync({
      userId,
      action: 'user.update_profile',
      ipAddress: ip,
      metadata: { field: 'name' },
   });
};

export const requestDeliveryEmailChange = async (
   userId: string,
   newEmailRaw: string,
   ip: string,
): Promise<void> => {
   const { canonical, delivery } = normalizeEmail(newEmailRaw);

   if (!isAllowedDomain(canonical)) {
      throw new AppError('This email domain is not permitted for use.', 400);
   }

   await mailService.checkEmailRateLimit(delivery);

   const fullUser = await userRepository.findAuthDataById(userId);
   if (!fullUser) throw new AppError('The requested user account could not be found.', 404);

   const currentDelivery = await userRepository.findDeliveryEmail(userId);
   if (currentDelivery === delivery) {
      throw new AppError('This email address is already set as your delivery email.', 400);
   }

   const otp = generateOtp();
   const otpKey = `${REDIS_PREFIX.DELIVERY_EMAIL_OTP}${userId}`;
   await redisService.setWithTTL(
      otpKey,
      JSON.stringify({ hash: hashOtp(otp), newEmail: delivery }),
      PASSWORD_CHANGE_OTP_TTL,
   );

   mailService.sendOtp(delivery, otp);

   logEventAsync({
      userId,
      action: 'user.update_profile',
      ipAddress: ip,
      metadata: { field: 'delivery_email_request' },
   });
};

export const confirmDeliveryEmailChange = async (
   userId: string,
   otp: string,
   ip: string,
): Promise<void> => {
   const otpKey = `${REDIS_PREFIX.DELIVERY_EMAIL_OTP}${userId}`;
   const storedData = await redisService.get(otpKey);

   if (!storedData) {
      throw new AppError('The verification code has expired or is invalid.', 400);
   }

   const { hash, newEmail } = JSON.parse(storedData) as { hash: string; newEmail: string };

   if (!verifyOtp(otp, hash)) {
      throw new AppError('The verification code provided is invalid.', 400);
   }

   await userRepository.updateDeliveryEmail(userId, newEmail);
   await redisService.del(otpKey);

   logEventAsync({
      userId,
      action: 'user.update_profile',
      ipAddress: ip,
      metadata: { field: 'delivery_email' },
   });
};
