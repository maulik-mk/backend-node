import { createHash } from 'node:crypto';

import { authLogsContainer } from '#config/connection/nosql/cosmos.azure.js';
import logger from '#common/utils/logger.js';

interface LoginAttemptData {
   userId?: string;
   identifier: string;
   ipAddress: string;
   success: boolean;
   failureReason?: string;
   metadata?: Record<string, unknown>;
}

/**
 * Masks an email or username so it's still recognizable but not directly usable.
 * "john@gmail.com" ----> "j***@gmail.com"
 * "myuser" ----> "my***"
 */
const maskIdentifier = (identifier: string): string => {
   if (identifier.includes('@')) {
      const [local, domain] = identifier.split('@');
      return `${local[0]}***@${domain}`;
   }
   return `${identifier.slice(0, 2)}***`;
};

const hashIp = (ip: string): string => createHash('sha256').update(ip).digest('hex').slice(0, 16);

export const recordAttempt = async (data: LoginAttemptData): Promise<void> => {
   if (!authLogsContainer) {
      logger.warn(
         { identifier: maskIdentifier(data.identifier) },
         'Authentication log service not configured. Skipping log.',
      );
      return;
   }

   try {
      const snowflakeId = await import('#common/utils/snowflake.js').then((m) => m.generateId());

      const document = {
         id: snowflakeId,
         identifier: maskIdentifier(data.identifier),
         userId: data.userId ?? 'anonymous',
         action: data.success ? 'auth.login_success' : 'auth.login_failed',
         operationType: 'authentication_attempt',
         ipHash: hashIp(data.ipAddress),
         metadata: {
            success: data.success,
            failureReason: data.failureReason ?? null,
            ...(data.metadata ?? {}),
         },
         timestamp: Date.now(),
         createdAt: new Date().toISOString(),
      };

      await authLogsContainer.items.create(document);
   } catch (err) {
      logger.error({ err }, 'Failed to record authentication attempt.');
   }
};

export const recordAttemptAsync = (data: LoginAttemptData): void => {
   recordAttempt(data).catch((err: unknown) => {
      logger.error({ err }, 'Asynchronous authentication record failed.');
   });
};
