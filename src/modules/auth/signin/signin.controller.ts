import type { FastifyReply, FastifyRequest } from 'fastify';

import {
   DEVICE_ID_COOKIE,
   LOGGED_IN_COOKIE,
   SESSION_STRICT_COOKIE,
   SESSION_TOKEN_COOKIE,
   USER_DISPLAY_COOKIE,
} from '#common/constants/index.const.js';
import {
   deviceIdCookieOpts,
   sessionCookieOpts,
   sessionStrictCookieOpts,
   uiCookieOpts,
} from '#common/utils/security/cookie.js';
import { generateId } from '#common/utils/snowflake.js';
import env from '#config/env.js';
import type { Signin2FADTO, SigninDTO } from '#modules/auth/signin/signin.schema.js';
import * as signinService from '#modules/auth/signin/signin.service.js';

const setAuthCookies = (
   request: FastifyRequest,
   reply: FastifyReply,
   token: string,
   username: string,
   deviceId: string,
) => {
   reply.setCookie(SESSION_TOKEN_COOKIE, token, sessionCookieOpts(env));

   reply.setCookie(SESSION_STRICT_COOKIE, token, sessionStrictCookieOpts(env));

   if (!request.cookies[DEVICE_ID_COOKIE]) {
      reply.setCookie(DEVICE_ID_COOKIE, deviceId, deviceIdCookieOpts(env));
   }

   reply.setCookie(LOGGED_IN_COOKIE, 'yes', uiCookieOpts(env, env.SESSION_TTL));
   reply.setCookie(USER_DISPLAY_COOKIE, username, uiCookieOpts(env, env.SESSION_TTL));
};

const getDeviceId = (request: FastifyRequest): string => {
   const existing = request.cookies[DEVICE_ID_COOKIE];
   if (existing) {
      const unsigned = request.unsignCookie(existing);
      if (unsigned.valid && unsigned.value) return unsigned.value;
   }
   return generateId();
};

export const signin = async (request: FastifyRequest<{ Body: SigninDTO }>, reply: FastifyReply) => {
   const userAgent = request.headers['user-agent'] ?? '';
   const ip = request.ip;
   const deviceId = getDeviceId(request);

   const result = await signinService.login(request.body, userAgent, ip, deviceId);

   if (result.requires2FA) {
      return reply.status(200).send({
         success: true,
         message: 'Two-factor authentication is required to proceed.',
         data: { requires2FA: true, sessionId: result.sessionId },
      });
   }

   if (result.token) {
      setAuthCookies(request, reply, result.token, result.user.username, deviceId);
   }

   return reply.status(200).send({
      success: true,
      message: 'Signed in successfully.',
      data: result.user,
   });
};

export const signin2FA = async (
   request: FastifyRequest<{ Body: Signin2FADTO }>,
   reply: FastifyReply,
) => {
   const { sessionId, token } = request.body;
   const deviceId = getDeviceId(request);
   const result = await signinService.verify2FALogin(sessionId, token, deviceId);

   setAuthCookies(request, reply, result.token, result.user.username, deviceId);

   return reply.status(200).send({
      success: true,
      message: 'Signed in successfully.',
      data: result.user,
   });
};
