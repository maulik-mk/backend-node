import bcrypt from 'bcrypt';

import { PASSWORD_HISTORY_LIMIT } from '#common/constants/index.const.js';
import { decrypt } from '#common/utils/security/encryption.js';
import pool, { query } from '#config/connection/sql/db.js';
import type { AuthUserRow, UserProfileDTO } from '#database/models/user.model.js';
import * as twoFactorService from '#modules/auth/twoFactor.service.js';

export const findAuthDataById = async (id: string): Promise<AuthUserRow | null> => {
   const result = await query(
      `SELECT u.id, u.public_id, u.username, u.status,
              ue.email, ue.delivery_email, ue.is_verified,
              uc.password_hash, uc.is_two_factor_enabled, uc.two_factor_secret,
              up.first_name, up.last_name, up.avatar_id
       FROM users u
       JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = TRUE
       JOIN user_credentials uc ON uc.user_id = u.id
       JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [id],
   );
   return (result.rows[0] as AuthUserRow | undefined) ?? null;
};

export const findProfileById = async (id: string): Promise<UserProfileDTO | null> => {
   const result = await query(
      `SELECT u.id, u.public_id, u.username, u.status, u.created_at, u.updated_at,
              up.first_name, up.last_name, up.birth_date, up.country, up.avatar_id,
              ue.email, ue.delivery_email, ue.is_verified,
              uc.is_two_factor_enabled
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = TRUE
       JOIN user_credentials uc ON uc.user_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [id],
   );
   return (result.rows[0] as UserProfileDTO | undefined) ?? null;
};

export const findMeProfileById = async (id: string): Promise<AuthUserRow | null> => {
   const result = await query(
      `SELECT u.id, u.public_id, u.username,
              ue.email, ue.delivery_email,
              up.first_name, up.last_name, up.avatar_id,
              uc.is_two_factor_enabled
       FROM users u
       JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = TRUE
       JOIN user_profiles up ON up.user_id = u.id
       JOIN user_credentials uc ON uc.user_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [id],
   );
   return (result.rows[0] as AuthUserRow | undefined) ?? null;
};

export const findByEmail = async (email: string): Promise<AuthUserRow | null> => {
   const result = await query(
      `SELECT u.id, u.public_id, u.username, u.status,
              ue.email, ue.delivery_email, ue.is_verified,
              uc.password_hash, uc.is_two_factor_enabled, uc.two_factor_secret,
              up.first_name, up.last_name, up.avatar_id
       FROM users u
       JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = TRUE
       JOIN user_credentials uc ON uc.user_id = u.id
       JOIN user_profiles up ON up.user_id = u.id
       WHERE LOWER(ue.email) = LOWER($1) LIMIT 1`,
      [email],
   );
   return (result.rows[0] as AuthUserRow | undefined) ?? null;
};

export const updateTwoFactorSecret = async (
   userId: string,
   secret: string | null,
): Promise<void> => {
   await query('UPDATE user_credentials SET two_factor_secret = $1 WHERE user_id = $2', [
      secret,
      userId,
   ]);
};

export const enableTwoFactor = async (userId: string): Promise<void> => {
   await query('UPDATE user_credentials SET is_two_factor_enabled = TRUE WHERE user_id = $1', [
      userId,
   ]);
};

export const disableTwoFactor = async (userId: string): Promise<void> => {
   await query(
      'UPDATE user_credentials SET is_two_factor_enabled = FALSE, two_factor_secret = NULL WHERE user_id = $1',
      [userId],
   );
};

export const updatePassword = async (userId: string, passwordHash: string): Promise<void> => {
   const client = await pool.connect();
   try {
      await client.query('BEGIN');

      await client.query(
         'UPDATE user_credentials SET password_hash = $1, password_changed_at = NOW() WHERE user_id = $2',
         [passwordHash, userId],
      );

      await client.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [
         userId,
         passwordHash,
      ]);

      await client.query(
         `DELETE FROM password_history
          WHERE user_id = $1 AND id NOT IN (
             SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
          )`,
         [userId, PASSWORD_HISTORY_LIMIT],
      );

      await client.query('COMMIT');
   } catch (err) {
      await client.query('ROLLBACK');
      throw err;
   } finally {
      client.release();
   }
};

export const isPasswordInHistory = async (
   userId: string,
   plainPassword: string,
): Promise<boolean> => {
   const result = await query(
      'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, PASSWORD_HISTORY_LIMIT],
   );

   for (const row of result.rows as { password_hash: string }[]) {
      const match = await bcrypt.compare(plainPassword, row.password_hash);
      if (match) return true;
   }

   return false;
};

export const updateName = async (
   userId: string,
   firstName: string,
   lastName: string,
): Promise<void> => {
   await query('UPDATE user_profiles SET first_name = $1, last_name = $2 WHERE user_id = $3', [
      firstName,
      lastName,
      userId,
   ]);
};

export const updateDeliveryEmail = async (userId: string, deliveryEmail: string): Promise<void> => {
   await query(
      'UPDATE user_emails SET delivery_email = $1 WHERE user_id = $2 AND is_primary = TRUE',
      [deliveryEmail, userId],
   );
};

export const findDeliveryEmail = async (userId: string): Promise<string | null> => {
   const result = await query(
      'SELECT delivery_email FROM user_emails WHERE user_id = $1 AND is_primary = TRUE LIMIT 1',
      [userId],
   );
   return (result.rows[0] as { delivery_email: string } | undefined)?.delivery_email ?? null;
};

export const updateAvatarId = async (userId: string, avatarId: string | null): Promise<void> => {
   await query('UPDATE user_profiles SET avatar_id = $1 WHERE user_id = $2', [avatarId, userId]);
};

export const verifyTwoFactorToken = async (userId: string, token: string): Promise<boolean> => {
   const user = await findAuthDataById(userId);
   if (!user?.two_factor_secret) return false;

   try {
      const decryptedSecret = await decrypt(user.two_factor_secret);
      return twoFactorService.verifyToken(token, decryptedSecret);
   } catch {
      return false;
   }
};
