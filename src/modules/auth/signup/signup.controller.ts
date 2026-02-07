import type { FastifyReply, FastifyRequest } from 'fastify';

import { SIGNUP_COOKIE_NAME } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import env from '#config/env.js';

import type { SignupDTO, VerifyOtpDTO } from './signup.schema.js';
import * as signupService from './signup.service.js';

const COOKIE_OPTS = {
   httpOnly: true,
   secure: env.NODE_ENV === 'production',
   domain: env.COOKIE_DOMAIN,
   path: '/api/v1/auth/signup',
   maxAge: env.OTP_TTL,
   sameSite: 'lax' as const,
   signed: true,
};

export const signup = async (request: FastifyRequest<{ Body: SignupDTO }>, reply: FastifyReply) => {
   const sessionId = await signupService.initiateSignup(request.body);
   reply.setCookie(SIGNUP_COOKIE_NAME, sessionId, COOKIE_OPTS);
   return reply
      .status(200)
      .send({ success: true, message: 'A verification code has been sent to your email address.' });
};

export const verifyOtp = async (
   request: FastifyRequest<{ Body: VerifyOtpDTO }>,
   reply: FastifyReply,
) => {
   const sessionId = request.unsignCookie(request.cookies[SIGNUP_COOKIE_NAME] ?? '');
   if (!sessionId.valid || !sessionId.value)
      throw new AppError('The signup session is invalid or has expired.', 400);

   const user = await signupService.verifySignupOtp(
      sessionId.value,
      request.body.otp,
      request.ip || '',
   );
   reply.clearCookie(SIGNUP_COOKIE_NAME, { path: '/api/v1/auth/signup' });
   return reply.status(201).send({
      success: true,
      message: 'Your account has been successfully created.',
      data: { publicId: user.publicId, username: user.username, email: user.email },
   });
};

export const resendOtp = async (request: FastifyRequest, reply: FastifyReply) => {
   const sessionId = request.unsignCookie(request.cookies[SIGNUP_COOKIE_NAME] ?? '');
   if (!sessionId.valid || !sessionId.value)
      throw new AppError('The signup session is invalid or has expired.', 400);

   await signupService.resendOtp(sessionId.value);
   return reply
      .status(200)
      .send({ success: true, message: 'A new verification code has been sent.' });
};
