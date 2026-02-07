import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { RATE_LIMIT } from '#common/constants/index.const.js';
import * as signupController from '#modules/auth/signup/signup.controller.js';
import { signupRouteSchema, verifyOtpRouteSchema } from '#modules/auth/signup/signup.schema.js';

export default function signupRoutes(app: FastifyInstance) {
   app.post(
      '/_init',
      {
         schema: signupRouteSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.SIGNUP.max,
               timeWindow: RATE_LIMIT.SIGNUP.timeWindow,
            },
         },
      },
      signupController.signup as (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
   );

   app.post(
      '/verify-otp',
      {
         schema: verifyOtpRouteSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.VERIFY_OTP.max,
               timeWindow: RATE_LIMIT.VERIFY_OTP.timeWindow,
            },
         },
      },
      signupController.verifyOtp as (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
   );

   app.post(
      '/resend-otp',
      {
         schema: { body: {} },
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.RESEND_OTP.max,
               timeWindow: RATE_LIMIT.RESEND_OTP.timeWindow,
            },
         },
      },
      signupController.resendOtp,
   );
}
