import type { CookieSerializeOptions } from '@fastify/cookie';

import type { Env } from '#config/env.js';

export const sessionCookieOpts = (env: Env): CookieSerializeOptions => ({
   httpOnly: true,
   secure: env.NODE_ENV === 'production',
   domain: env.COOKIE_DOMAIN,
   path: '/',
   maxAge: env.SESSION_TTL,
   sameSite: 'lax',
   signed: true,
});

export const sessionStrictCookieOpts = (env: Env): CookieSerializeOptions => ({
   httpOnly: true,
   secure: env.NODE_ENV === 'production',
   path: '/',
   maxAge: env.SESSION_TTL,
   sameSite: 'strict',
   signed: true,
});

export const deviceIdCookieOpts = (env: Env): CookieSerializeOptions => ({
   httpOnly: false,
   secure: env.NODE_ENV === 'production',
   domain: env.COOKIE_DOMAIN,
   path: '/',
   maxAge: 365 * 24 * 60 * 60,
   sameSite: 'lax',
   signed: true,
});

export const uiCookieOpts = (env: Env, maxAge: number): CookieSerializeOptions => ({
   httpOnly: false,
   secure: env.NODE_ENV === 'production',
   domain: env.COOKIE_DOMAIN,
   path: '/',
   maxAge,
   sameSite: 'lax',
   signed: false,
});

export const clearCookieOpts = (env: Env): CookieSerializeOptions => ({
   path: '/',
   domain: env.COOKIE_DOMAIN,
});

export const clearStrictCookieOpts = (): CookieSerializeOptions => ({
   path: '/',
});
