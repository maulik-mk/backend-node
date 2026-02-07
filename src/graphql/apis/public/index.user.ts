import type { FastifyReply, FastifyRequest } from 'fastify';
import depthLimit from 'graphql-depth-limit';
import mercurius from 'mercurius';

import { AppError } from '#common/errors/appError.js';
import type { Env } from '#config/env.js';
import { auditResolvers } from '#modules/audit/audit.resolvers.js';
import { auditTypeDefs } from '#modules/audit/audit.typeDefs.js';
import { userResolvers } from '#modules/user/user.resolvers.js';
import { userTypeDefs } from '#modules/user/user.typeDefs.js';

declare module 'mercurius' {
   interface MercuriusContext {
      request: FastifyRequest;
      reply: FastifyReply;
   }
}

export const buildGraphQLConfig = (env: Env) => ({
   schema: [userTypeDefs, auditTypeDefs],
   resolvers: {
      Query: { ...userResolvers.Query, ...auditResolvers.Query },
      Mutation: { ...userResolvers.Mutation },
   },
   graphiql: env.NODE_ENV !== 'production',
   jit: 1,
   errorFormatter: (
      execution: Parameters<typeof mercurius.defaultErrorFormatter>[0],
      context: import('mercurius').MercuriusContext,
   ) => {
      const response = mercurius.defaultErrorFormatter(execution, context);

      response.response.errors = response.response.errors?.map((err) => {
         // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
         const originalError = (err as any).originalError as Error | undefined;

         if (originalError instanceof AppError) {
            return err;
         }

         if (
            !originalError ||
            err.message.startsWith('Variable "$') ||
            err.message.startsWith('Cannot query') ||
            err.message.startsWith('Syntax Error')
         ) {
            return err;
         }

         // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
         if (context.request) {
            context.request.log.error(
               // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-condition
               { err: originalError || err, path: (err as any).path },
               'GraphQL Internal Error',
            );
         }

         return {
            ...err,
            message: 'Internal server error',
         } as Error;
      });

      return response;
   },
   validationRules: [depthLimit(5)],
   maxAliases: 10,
   limit: {
      complexity: 250,
   },
   context: (request: FastifyRequest, reply: FastifyReply) => ({
      request,
      reply,
      app: request.server,
   }),
});
