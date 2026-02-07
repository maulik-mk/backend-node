import type { MercuriusContext } from 'mercurius';

import {
   LOGGED_IN_COOKIE,
   SESSION_STRICT_COOKIE,
   SESSION_TOKEN_COOKIE,
   USER_DISPLAY_COOKIE,
} from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { eventService } from '#common/services/event.service.js';
import { clearCookieOpts, clearStrictCookieOpts } from '#common/utils/security/cookie.js';
import redis from '#config/connection/nosql/redis.js';
import env from '#config/env.js';
import { logEventAsync } from '#modules/audit/audit.repository.js';
import * as sessionService from '#modules/session/session.service.js';
import * as userRepository from '#modules/user/user.repository.js';
import * as userService from '#modules/user/user.service.js';

const requireAuth = (ctx: MercuriusContext) => {
   const user = ctx.request.user;
   if (!user) throw new AppError('Authentication is required to access this resource.', 401);
   return user;
};

export const userResolvers = {
   Query: {
      me: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         const fullUser = await userRepository.findMeProfileById(user.userId);
         if (!fullUser) throw new AppError('The requested user account could not be found.', 404);
         return {
            publicId: fullUser.public_id,
            username: fullUser.username,
            email: fullUser.email,
            deliveryEmail: fullUser.delivery_email,
            firstName: fullUser.first_name,
            lastName: fullUser.last_name,
            avatarId: fullUser.avatar_id,
            isTwoFactorEnabled: fullUser.is_two_factor_enabled,
         };
      },

      mySessions: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         const token =
            ctx.request.sessionToken ??
            ctx.request.unsignCookie(ctx.request.cookies[SESSION_TOKEN_COOKIE] ?? '').value ??
            '';
         const sessions = await sessionService.listSessions(user.userId, token);

         const activeSessionIds = await redis.hvals(`presence_hash:${user.userId}`);
         const activeSet = new Set(activeSessionIds);

         return sessions.map((session) => {
            const { userId, uaHash, ...safeData } = session;
            void userId;
            void uaHash;
            return {
               ...safeData,
               isOnline: activeSet.has(session.sessionId),
            };
         });
      },
   },

   Mutation: {
      signout: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         const token =
            ctx.request.sessionToken ??
            ctx.request.unsignCookie(ctx.request.cookies[SESSION_TOKEN_COOKIE] ?? '').value;
         if (token) await sessionService.logout(token, user.userId);
         logEventAsync({
            userId: user.userId,
            action: 'auth.logout',
            ipAddress: ctx.request.ip,
         });
         ctx.reply.clearCookie(SESSION_TOKEN_COOKIE, clearCookieOpts(env));
         ctx.reply.clearCookie(SESSION_STRICT_COOKIE, clearStrictCookieOpts());
         ctx.reply.clearCookie(LOGGED_IN_COOKIE, clearCookieOpts(env));
         ctx.reply.clearCookie(USER_DISPLAY_COOKIE, clearCookieOpts(env));
         return true;
      },

      signoutAll: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         await sessionService.logoutAll(user.userId);
         logEventAsync({
            userId: user.userId,
            action: 'auth.logout_all',
            ipAddress: ctx.request.ip,
         });
         ctx.reply.clearCookie(SESSION_TOKEN_COOKIE, clearCookieOpts(env));
         ctx.reply.clearCookie(SESSION_STRICT_COOKIE, clearStrictCookieOpts());
         ctx.reply.clearCookie(LOGGED_IN_COOKIE, clearCookieOpts(env));
         ctx.reply.clearCookie(USER_DISPLAY_COOKIE, clearCookieOpts(env));

         await eventService.publishToUser(user.userId, { type: 'SESSION_REVOKED' });

         return true;
      },

      signoutSession: async (
         _: unknown,
         { sessionId }: { sessionId: string },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         await sessionService.logoutSpecific(user.userId, sessionId);
         logEventAsync({
            userId: user.userId,
            action: 'auth.revoke_session',
            ipAddress: ctx.request.ip,
            metadata: { revokedSessionId: sessionId },
         });

         await eventService.publishToUser(user.userId, { type: 'SESSION_REVOKED', sessionId });

         return true;
      },

      setup2FA: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         return userService.setup2FA(user.userId, user.email);
      },

      confirm2FA: async (_: unknown, { token }: { token: string }, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         await userService.confirm2FA(user.userId, token, ctx.request.ip);
         return true;
      },

      disable2FA: async (_: unknown, { token }: { token: string }, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         await userService.disable2FA(user.userId, token, ctx.request.ip);
         return true;
      },

      requestPasswordChange: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
         const user = requireAuth(ctx);
         await userService.requestPasswordChange(user.userId, user.email, ctx.request.ip);
         return true;
      },

      changePassword: async (
         _: unknown,
         { newPassword, code }: { newPassword: string; code: string },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         await userService.changePassword(user.userId, newPassword, code, ctx.request.ip);
         return true;
      },

      updateName: async (
         _: unknown,
         { firstName, lastName }: { firstName: string; lastName: string },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         await userService.updateName(user.userId, firstName, lastName, ctx.request.ip);
         return true;
      },

      requestDeliveryEmailChange: async (
         _: unknown,
         { newEmail }: { newEmail: string },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         await userService.requestDeliveryEmailChange(user.userId, newEmail, ctx.request.ip);
         return true;
      },

      confirmDeliveryEmailChange: async (
         _: unknown,
         { otp }: { otp: string },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         await userService.confirmDeliveryEmailChange(user.userId, otp, ctx.request.ip);
         return true;
      },
   },
};
