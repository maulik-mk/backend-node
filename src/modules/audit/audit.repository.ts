import { createHash } from 'node:crypto';

import { auditLogsContainer } from '#config/connection/nosql/cosmos.azure.js';
import logger from '#common/utils/logger.js';

export type AuditAction =
   | 'auth.signup_initiated'
   | 'auth.signup_completed'
   | 'auth.login_success'
   | 'auth.login_failed'
   | 'auth.login_success_2fa'
   | 'user.account_locked'
   | 'user.account_unlocked'
   | 'auth.logout'
   | 'auth.logout_all'
   | 'auth.revoke_session'
   | 'user.password_changed'
   | 'user.password_reset_requested'
   | 'user.password_reset_completed'
   | 'user.enable_2fa'
   | 'user.disable_2fa'
   | 'user.email_verified'
   | 'user.password_change_otp_sent'
   | 'user.update_profile';

interface AuditEventData {
   userId: string;
   action: AuditAction;
   ipAddress?: string;
   metadata?: Record<string, unknown>;
}

/**
 * Hashes an IP address so we can correlate events from the same source
 * without storing the raw IP.
 */
const hashIp = (ip: string): string => createHash('sha256').update(ip).digest('hex').slice(0, 16);

export const logEvent = async (data: AuditEventData): Promise<void> => {
   if (!auditLogsContainer) {
      logger.warn({ action: data.action }, 'Audit log service not configured. Skipping log.');
      return;
   }

   try {
      const snowflakeId = await import('#common/utils/snowflake.js').then((m) => m.generateId());

      const document = {
         id: snowflakeId,
         userId: data.userId,
         action: data.action,
         operationType: 'authentication',
         ipHash: data.ipAddress ? hashIp(data.ipAddress) : null,
         metadata: data.metadata ?? {},
         timestamp: Date.now(),
         createdAt: new Date().toISOString(),
      };

      await auditLogsContainer.items.create(document);
   } catch (err) {
      logger.error({ action: data.action, err }, 'Failed to write audit log.');
   }
};

interface AuditLogEntry {
   id: string;
   userId: string;
   action: string;
   operationType: string;
   ipHash: string | null;
   metadata: Record<string, unknown>;
   timestamp: number;
}

export const getAuditLogs = async (
   userId: string,
   limit = 10,
   offset = 0,
): Promise<AuditLogEntry[]> => {
   const fetchLimit = offset + limit;

   const [auditLogs, authLogs] = await Promise.all([
      (async (): Promise<AuditLogEntry[]> => {
         if (!auditLogsContainer) return [];
         const { resources } = await auditLogsContainer.items
            .query<AuditLogEntry>({
               query: 'SELECT c.id, c.userId, c.action, c.operationType, c.ipHash, c.metadata, c.timestamp FROM c WHERE c.userId = @userId ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit',
               parameters: [
                  { name: '@userId', value: userId },
                  { name: '@limit', value: fetchLimit },
               ],
            })
            .fetchAll();
         return resources;
      })(),
      (async (): Promise<AuditLogEntry[]> => {
         const { authLogsContainer } = await import('#config/connection/nosql/cosmos.azure.js');
         if (!authLogsContainer) return [];

         const { resources } = await authLogsContainer.items
            .query<AuditLogEntry>({
               query: 'SELECT c.id, c.userId, c.action, c.operationType, c.ipHash, c.metadata, c.timestamp FROM c WHERE c.userId = @userId ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit',
               parameters: [
                  { name: '@userId', value: userId },
                  { name: '@limit', value: fetchLimit },
               ],
            })
            .fetchAll();
         return resources;
      })(),
   ]);

   const merged: AuditLogEntry[] = [...auditLogs, ...authLogs].sort(
      (a, b) => b.timestamp - a.timestamp,
   );
   return merged.slice(offset, offset + limit);
};

export const logEventAsync = (data: AuditEventData): void => {
   logEvent(data).catch((err: unknown) => {
      logger.error({ action: data.action, err }, 'Asynchronous audit log failed.');
   });
};
