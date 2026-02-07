import { createHash } from 'node:crypto';

import logger from '#common/utils/logger.js';
import { query } from '#config/connection/sql/db.js';
import type { UserSessionRow } from '#database/models/user.model.js';

const hashTokenForDb = (token: string): string => {
   return createHash('sha256').update(token).digest('hex');
};

const hashIp = (ip: string): string => createHash('sha256').update(ip).digest('hex').slice(0, 16);

export interface CreateSessionData {
   sessionId: string;
   userId: string;
   token: string;
   ipAddress: string;
   browser?: string;
   os?: string;
   deviceType?: string;
   location?: string;
   latitude?: number;
   longitude?: number;
   expiresAt: Date;
}

export const createSession = async (data: CreateSessionData): Promise<void> => {
   try {
      await query(
         `INSERT INTO user_sessions
            (session_id, user_id, token_hash, ip_address, browser, os, device_type, location, latitude, longitude, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
         [
            data.sessionId,
            data.userId,
            hashTokenForDb(data.token),
            hashIp(data.ipAddress),
            data.browser ?? null,
            data.os ?? null,
            data.deviceType ?? 'desktop',
            data.location ?? null,
            data.latitude ?? null,
            data.longitude ?? null,
            data.expiresAt,
         ],
      );
   } catch (err) {
      logger.error({ sessionId: data.sessionId, err }, 'Failed to record session in database.');
   }
};

export const revokeSession = async (sessionId: string): Promise<void> => {
   await query(
      `UPDATE user_sessions SET is_active = FALSE, revoked_at = NOW()
       WHERE session_id = $1 AND is_active = TRUE`,
      [sessionId],
   );
};

export const revokeAllUserSessions = async (userId: string): Promise<void> => {
   await query(
      `UPDATE user_sessions SET is_active = FALSE, revoked_at = NOW()
       WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
   );
};

export const getActiveSessions = async (userId: string): Promise<UserSessionRow[]> => {
   const result = await query(
      `SELECT * FROM user_sessions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY last_accessed_at DESC`,
      [userId],
   );
   return result.rows as UserSessionRow[];
};

export const cleanupExpiredSessions = async (): Promise<number> => {
   const result = await query(
      `UPDATE user_sessions SET is_active = FALSE
       WHERE is_active = TRUE AND expires_at <= NOW()`,
   );
   return result.rowCount ?? 0;
};
