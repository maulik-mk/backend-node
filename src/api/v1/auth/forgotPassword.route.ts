import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { RATE_LIMIT } from '#common/constants/index.const.js';
import * as forgotPasswordController from '#modules/auth/forgotPassword/forgotPassword.controller.js';
import {
   forgotPasswordSchema,
   resetPasswordSchema,
   verifyLinkSchema,
   verifyOTPSchema,
} from '#modules/auth/forgotPassword/forgotPassword.schema.js';

export default function forgotPasswordRoutes(app: FastifyInstance) {
   app.post(
      '/forgot-password',
      {
         schema: forgotPasswordSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: 5,
               timeWindow: '1 minute',
            },
         },
      },
      forgotPasswordController.forgotPassword as (
         request: FastifyRequest,
         reply: FastifyReply,
      ) => Promise<void>,
   );

   app.post(
      '/verify-otp',
      {
         schema: verifyOTPSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.VERIFY_RESET_OTP.max,
               timeWindow: RATE_LIMIT.VERIFY_RESET_OTP.timeWindow,
            },
         },
      },
      forgotPasswordController.verifyOTP as (
         request: FastifyRequest,
         reply: FastifyReply,
      ) => Promise<void>,
   );

   app.post(
      '/verify-link',
      {
         schema: verifyLinkSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.VERIFY_RESET_LINK.max,
               timeWindow: RATE_LIMIT.VERIFY_RESET_LINK.timeWindow,
            },
         },
      },
      forgotPasswordController.verifyLink as (
         request: FastifyRequest,
         reply: FastifyReply,
      ) => Promise<void>,
   );

   app.post(
      '/reset-password',
      {
         schema: resetPasswordSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.RESET_PASSWORD.max,
               timeWindow: RATE_LIMIT.RESET_PASSWORD.timeWindow,
            },
         },
      },
      forgotPasswordController.resetPassword as (
         request: FastifyRequest,
         reply: FastifyReply,
      ) => Promise<void>,
   );
}
