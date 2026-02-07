import { query } from '#config/connection/sql/db.js';
import type { AuthUserRow } from '#database/models/user.model.js';

export const findByEmailOrUsername = async (identifier: string): Promise<AuthUserRow | null> => {
   const result = await query(
      `SELECT u.id, u.public_id, u.username, u.status,
              ue.email, ue.delivery_email, ue.is_verified,
              uc.password_hash, uc.is_two_factor_enabled, uc.two_factor_secret,
              up.first_name, up.last_name, up.avatar_id
       FROM users u
       JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = TRUE
       JOIN user_credentials uc ON uc.user_id = u.id
       JOIN user_profiles up ON up.user_id = u.id
       WHERE LOWER(ue.email) = LOWER($1) OR LOWER(u.username) = LOWER($1)
       LIMIT 1`,
      [identifier],
   );
   return (result.rows[0] as AuthUserRow | undefined) ?? null;
};
