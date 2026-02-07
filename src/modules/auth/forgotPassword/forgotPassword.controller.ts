import bcrypt from 'bcrypt';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { BCRYPT_SALT_ROUNDS } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { PASSWORD_REGEX } from '#common/schemas/index.schem.js';
import type {
   ForgotPasswordDTO,
   ResetPasswordDTO,
   VerifyLinkDTO,
   VerifyOTPDTO,
} from '#modules/auth/forgotPassword/forgotPassword.schema.js';
import * as forgotPasswordService from '#modules/auth/forgotPassword/forgotPassword.service.js';

export const forgotPassword = async (
   request: FastifyRequest<{ Body: ForgotPasswordDTO }>,
   reply: FastifyReply,
) => {
   const result = await forgotPasswordService.requestReset(request.body.email);
   return reply.status(200).send({
      success: true,
      message: result.message,
      data: { otpSessionId: result.otpSessionId },
   });
};

export const verifyOTP = async (
   request: FastifyRequest<{ Body: VerifyOTPDTO }>,
   reply: FastifyReply,
) => {
   const { otpSessionId, otp } = request.body;
   const result = await forgotPasswordService.verifyOTP(otpSessionId, otp);
   return reply.status(200).send({
      success: true,
      message: result.message,
   });
};

export const verifyLink = async (
   request: FastifyRequest<{ Body: VerifyLinkDTO }>,
   reply: FastifyReply,
) => {
   const result = await forgotPasswordService.verifyLink(request.body.token);
   return reply.status(200).send({
      success: true,
      message: result.message,
   });
};

export const resetPassword = async (
   request: FastifyRequest<{ Body: ResetPasswordDTO }>,
   reply: FastifyReply,
) => {
   const { token, password } = request.body;

   if (!PASSWORD_REGEX.test(password)) {
      throw new AppError('The password provided does not meet security requirements.', 400);
   }

   const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
   const result = await forgotPasswordService.resetPassword(token, hash);
   return reply.status(200).send({
      success: true,
      message: result.message,
   });
};
