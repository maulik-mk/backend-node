import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import csrf from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import Fastify from 'fastify';
import mercurius from 'mercurius';

import sessionStreamRoutes from '#api/v1/auth/sessionStream.route.js';
import v1Routes from '#api/v1/routes.js';
import { RATE_LIMIT } from '#common/constants/index.const.js';
import { AppError } from '#common/errors/appError.js';
import { authenticate } from '#common/middleware/authenticate.middleware.js';
import { azureStorage } from '#config/connection/buckets/azure.js';
import env from '#config/env.js';
import { buildGraphQLConfig } from '#graphql/index.ql.js';
import { startEmailWorker } from '#infra/mail/email.worker.js';
import { renderErrorPage } from '#templates/template.service.js';

const buildApp = async () => {
   const app = Fastify({
      logger: {
         level: env.NODE_ENV === 'production' ? 'info' : 'debug',
         transport:
            env.NODE_ENV !== 'production'
               ? { target: 'pino-pretty', options: { colorize: true } }
               : undefined,
      },
      trustProxy: true,
      requestTimeout: 30000,
      bodyLimit: 1048576,
      disableRequestLogging: env.NODE_ENV === 'production',
   });

   startEmailWorker();

   await azureStorage.ensureContainer();

   await app.register(helmet, {
      contentSecurityPolicy: {
         directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
         },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: {
         maxAge: 31536000,
         includeSubDomains: true,
         preload: true,
      },
      noSniff: true,
      xssFilter: true,
   });

   await app.register(cors, {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'csrf-token'],
      credentials: true,
      maxAge: 86400,
   });

   await app.register(rateLimit, {
      max: RATE_LIMIT.GLOBAL.max,
      timeWindow: RATE_LIMIT.GLOBAL.timeWindow,
      addHeadersOnExceeding: {
         'x-ratelimit-limit': true,
         'x-ratelimit-remaining': true,
         'x-ratelimit-reset': true,
      },
      addHeaders: {
         'x-ratelimit-limit': true,
         'x-ratelimit-remaining': true,
         'x-ratelimit-reset': true,
         'retry-after': true,
      },
      keyGenerator: (request) => {
         return (request.headers['cf-connecting-ip'] as string) || request.ip;
      },
      allowList: (request) => {
         return request.url.includes('/session-stream');
      },
   });

   await app.register(multipart, {
      limits: {
         fileSize: 5 * 1024 * 1024, // 5MB
      },
   });

   await app.register(sensible);

   await app.register(cookie, {
      secret: env.COOKIE_SECRET,
      hook: 'onRequest',
      parseOptions: {
         httpOnly: true,
         secure: env.NODE_ENV === 'production',
         sameSite: 'lax',
         domain: env.COOKIE_DOMAIN,
         path: '/',
      },
   });

   await app.register(csrf, {
      cookieOpts: {
         signed: true,
         httpOnly: true,
         sameSite: 'lax',
         secure: env.NODE_ENV === 'production',
         domain: env.COOKIE_DOMAIN,
         path: '/',
      },
      getToken: (request) => {
         return request.headers['x-csrf-token'] as string;
      },
   });

   await app.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 200 * 1024 * 1024,
      maxRssBytes: 350 * 1024 * 1024,
      maxEventLoopUtilization: 0.98,
      retryAfter: 50,
      pressureHandler: (_request, reply, type, value) => {
         reply.status(503).send({
            success: false,
            message: 'Service temporarily unavailable',
            retryAfter: 50,
            detail: env.NODE_ENV !== 'production' ? `${type}: ${String(value)}` : undefined,
         });
      },
   });

   await app.register(v1Routes, { prefix: '/api/v1' });

   app.register(async (protectedApp) => {
      protectedApp.addHook('preValidation', authenticate);
      protectedApp.addHook('preValidation', (request, reply, done) => {
         const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
         if (safeMethods.has(request.method)) {
            done();
            return;
         }
         protectedApp.csrfProtection.bind(protectedApp)(request, reply, done);
      });
      await protectedApp.register(mercurius, {
         ...buildGraphQLConfig(env),
         path: '/api/_he/graphql',
      });
      await protectedApp.register(sessionStreamRoutes, { prefix: '/api/v1/auth' });
   });

   app.get('/health', () => {
      return {
         status: 'ok',
         timestamp: new Date().toISOString(),
         uptime: process.uptime(),
      };
   });

   app.get('/api/v1/auth/csrf-token', async (request, reply) => {
      const token = reply.generateCsrf();
      return { token };
   });

   app.setNotFoundHandler((request, reply) => {
      const accept = request.headers.accept || '';
      if (accept.includes('text/html')) {
         return reply.status(404).type('text/html').send(renderErrorPage(404));
      }
      return reply.status(404).send({
         success: false,
         message: 'The requested resource was not found',
      });
   });

   app.setErrorHandler(
      (
         error: Error & {
            validation?: unknown;
            statusCode?: number;
            code?: string;
            isOperational?: boolean;
         },
         request,
         reply,
      ) => {
         if (error instanceof AppError) {
            if (!error.isOperational) {
               request.log.fatal(
                  { err: error, statusCode: error.statusCode },
                  `Non-operational error: ${error.message}`,
               );
            } else {
               request.log.warn({ err: error, statusCode: error.statusCode }, error.message);
            }
            return reply.status(error.statusCode).send({
               success: false,
               message: error.message,
            });
         }

         if (error.validation) {
            request.log.warn({ err: error }, 'Validation error');
            return reply.status(400).send({
               success: false,
               message: 'Invalid input provided. Please ensure all fields are properly formatted.',
            });
         }

         if (error.statusCode === 429) {
            return reply.status(429).send({
               success: false,
               message: 'Too many requests. Please try again later',
            });
         }

         if (error.code === 'FST_CSRF_INVALID_TOKEN') {
            request.log.warn({ ip: request.ip }, 'CSRF token validation failed');
            return reply.status(403).send({
               success: false,
               message: 'Invalid or missing CSRF token',
            });
         }

         if (error.code === 'FST_CSRF_MISSING_SECRET') {
            request.log.warn({ ip: request.ip }, 'CSRF secret missing');
            return reply.status(403).send({
               success: false,
               message: 'CSRF validation failed',
            });
         }

         request.log.error({ err: error, stack: error.stack }, 'Unhandled error');
         
         const statusCode = error.statusCode || 500;
         const accept = request.headers.accept || '';
         
         if (accept.includes('text/html')) {
            return reply.status(statusCode).type('text/html').send(renderErrorPage(statusCode));
         }

         return reply.status(statusCode).send({
            success: false,
            message: statusCode === 500 ? 'Internal server error' : error.message,
         });
      },
   );

   app.addHook('onRequest', (request, _reply, done) => {
      request.log.info(
         {
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
         },
         'Incoming request',
      );
      done();
   });

   app.addHook('onResponse', (request, reply, done) => {
      request.log.info(
         {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime: reply.elapsedTime,
         },
         'Request completed',
      );
      done();
   });

   return app;
};

export default buildApp;
