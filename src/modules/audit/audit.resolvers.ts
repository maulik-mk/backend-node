import type { MercuriusContext } from 'mercurius';

import { AppError } from '#common/errors/appError.js';
import * as auditRepository from '#modules/audit/audit.repository.js';

const requireAuth = (ctx: MercuriusContext) => {
   const user = ctx.request.user;
   if (!user) throw new AppError('Authentication is required to view security logs.', 401);
   return user;
};

const SENSITIVE_KEYS = ['token', 'secret', 'password', 'code', 'otp'];

export const auditResolvers = {
   Query: {
      myAuditLogs: async (
         _: unknown,
         { limit = 10, offset = 0 }: { limit?: number; offset?: number },
         ctx: MercuriusContext,
      ) => {
         const user = requireAuth(ctx);
         const safeLimit = Math.min(limit, 50);
         const logs = await auditRepository.getAuditLogs(user.userId, safeLimit, offset);

         return logs.map((log) => {
            let sanitizedMetadata: string | null = null;

            if (Object.keys(log.metadata).length > 0) {
               const filtered = Object.fromEntries(
                  Object.entries(log.metadata).filter(
                     ([key]) => !SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s)),
                  ),
               );
               sanitizedMetadata = JSON.stringify(filtered);
            }

            return {
               id: log.id,
               action: log.action,
               operationType: log.operationType,
               ipHash: log.ipHash,
               metadata: sanitizedMetadata,
               timestamp: log.timestamp,
            };
         });
      },
   },
};
