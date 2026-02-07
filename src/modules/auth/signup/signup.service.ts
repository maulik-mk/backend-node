import bcrypt from 'bcrypt';

import { BCRYPT_SALT_ROUNDS, REDIS_PREFIX } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { PASSWORD_REGEX } from '#common/schemas/index.schem.js';
import { generateOtp, hashOtp, verifyOtp } from '#common/utils/otp.js';
import { isAllowedDomain, normalizeEmail } from '#common/utils/security/validation.js';
import { generateId } from '#common/utils/snowflake.js';
import env from '#config/env.js';
import { toDTO } from '#database/models/user.model.js';
import * as redisService from '#infra/cache/redis.service.js';
import * as mailService from '#infra/mail/mail.service.js';
import { logEventAsync } from '#modules/audit/audit.repository.js';

import * as signupRepository from './signup.repository.js';
import type { SignupDTO } from './signup.schema.js';

interface SignupSession {
   firstName: string;
   lastName: string;
   username: string;
   email: string;
   deliveryEmail: string;
   passwordHash: string;
   birthDate: string;
   country: string;
   otpHash: string;
   attempts: number;
   createdAt: number;
}

export const initiateSignup = async (payload: SignupDTO): Promise<string> => {
   const { canonical, delivery } = normalizeEmail(payload.email);

   if (!isAllowedDomain(canonical))
      throw new AppError('The email domain provided is not permitted for registration.', 400);
   if (!PASSWORD_REGEX.test(payload.password))
      throw new AppError('The password provided does not meet security requirements.', 400);

   const [existingEmail, existingUsername] = await Promise.all([
      signupRepository.findByEmail(canonical),
      signupRepository.findByUsername(payload.username.trim()),
   ]);

   if (existingEmail)
      throw new AppError('This email address is already associated with an account.', 409);
   if (existingUsername)
      throw new AppError('This username is already taken. Please choose another.', 409);

   await mailService.checkEmailRateLimit(delivery);

   const hashedPassword = await bcrypt.hash(payload.password, BCRYPT_SALT_ROUNDS);
   const otp = generateOtp();
   const sessionId = generateId();

   const sessionData: SignupSession = {
      firstName: payload.firstName,
      lastName: payload.lastName,
      username: payload.username,
      email: canonical,
      deliveryEmail: delivery,
      passwordHash: hashedPassword,
      birthDate: payload.birthDate,
      country: payload.country,
      otpHash: hashOtp(otp),
      attempts: 0,
      createdAt: Date.now(),
   };

   await redisService.setWithTTL(
      `${REDIS_PREFIX.SIGNUP}${sessionId}`,
      JSON.stringify(sessionData),
      env.OTP_TTL,
   );
   mailService.sendOtp(delivery, otp);
   return sessionId;
};

export const verifySignupOtp = async (sessionId: string, otp: string, ip: string) => {
   const key = `${REDIS_PREFIX.SIGNUP}${sessionId}`;
   const raw = await redisService.get(key);
   if (!raw) throw new AppError('The signup session has expired or is invalid.', 400);

   const session = JSON.parse(raw) as SignupSession;
   if (session.attempts >= env.OTP_MAX_ATTEMPTS) {
      await redisService.del(key);
      throw new AppError('Too many verification attempts. Please request a new code.', 429);
   }

   if (!verifyOtp(otp, session.otpHash)) {
      session.attempts += 1;
      await redisService.setWithTTL(key, JSON.stringify(session), env.OTP_TTL);
      throw new AppError('The verification code provided is invalid.', 400);
   }

   let user;
   try {
      user = await signupRepository.create({
         firstName: session.firstName,
         lastName: session.lastName,
         username: session.username,
         email: session.email,
         deliveryEmail: session.deliveryEmail,
         passwordHash: session.passwordHash,
         birthDate: new Date(session.birthDate),
         country: session.country,
      });
   } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505')
         throw new AppError('An account with these details already exists.', 409);
      throw err;
   }

   await redisService.del(key);

   logEventAsync({
      userId: user.id,
      action: 'auth.signup_completed',
      ipAddress: ip,
   });

   const profile = {
      ...user,
      first_name: session.firstName,
      last_name: session.lastName,
      delivery_email: session.deliveryEmail,
      birth_date: new Date(session.birthDate),
      country: session.country,
      created_at: new Date(),
      updated_at: new Date(),
   };

   return toDTO(profile);
};

export const resendOtp = async (sessionId: string): Promise<void> => {
   const key = `${REDIS_PREFIX.SIGNUP}${sessionId}`;
   const raw = await redisService.get(key);
   if (!raw) throw new AppError('The signup session has expired or is invalid.', 400);

   const session = JSON.parse(raw) as SignupSession;

   await mailService.checkEmailRateLimit(session.deliveryEmail);

   const otp = generateOtp();
   session.otpHash = hashOtp(otp);
   session.attempts = 0;
   await redisService.setWithTTL(key, JSON.stringify(session), env.OTP_TTL);
   mailService.sendOtp(session.deliveryEmail, otp);
};
