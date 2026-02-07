import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { RATE_LIMIT } from '#common/constants/index.const.js';
import * as signinController from '#modules/auth/signin/signin.controller.js';
import { signin2FARouteSchema, signinRouteSchema } from '#modules/auth/signin/signin.schema.js';

export default function signinRoutes(app: FastifyInstance) {
   app.post(
      '/signin',
      {
         schema: signinRouteSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.SIGNIN.max,
               timeWindow: RATE_LIMIT.SIGNIN.timeWindow,
            },
         },
      },
      signinController.signin as (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
   );

   app.post(
      '/signin/2fa',
      {
         schema: signin2FARouteSchema,
         preValidation: app.csrfProtection.bind(app),
         config: {
            rateLimit: {
               max: RATE_LIMIT.SIGNIN_2FA.max,
               timeWindow: RATE_LIMIT.SIGNIN_2FA.timeWindow,
            },
         },
      },
      signinController.signin2FA as (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
   );
}
