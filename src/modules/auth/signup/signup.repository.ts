import { generatePublicId } from '#common/utils/security/token.js';
import pool, { query } from '#config/connection/sql/db.js';
import type { AuthUserRow, UserEmailRow } from '#database/models/user.model.js';

export interface CreateUserData {
   firstName: string;
   lastName: string;
   username: string;
   email: string;
   deliveryEmail: string;
   passwordHash: string;
   birthDate: Date;
   country: string;
}

export const findByEmail = async (email: string): Promise<UserEmailRow | null> => {
   const result = await query('SELECT * FROM user_emails WHERE LOWER(email) = LOWER($1) LIMIT 1', [
      email,
   ]);
   return (result.rows[0] as UserEmailRow | undefined) ?? null;
};

export const findByUsername = async (
   username: string,
): Promise<{ id: string; username: string } | null> => {
   const result = await query(
      'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [username],
   );
   return (result.rows[0] as { id: string; username: string } | undefined) ?? null;
};

export const create = async (data: CreateUserData): Promise<AuthUserRow> => {
   const client = await pool.connect();
   const publicId = generatePublicId();

   try {
      await client.query('BEGIN');

      const userResult = await client.query(
         `INSERT INTO users (public_id, username, status)
          VALUES ($1, $2, 'active') RETURNING *`,
         [publicId, data.username],
      );
      const user = userResult.rows[0] as {
         id: string;
         public_id: string;
         username: string;
         status: string;
      };

      // 2. Profile
      await client.query(
         `INSERT INTO user_profiles (user_id, first_name, last_name, birth_date, country)
          VALUES ($1, $2, $3, $4, $5)`,
         [user.id, data.firstName, data.lastName, data.birthDate, data.country],
      );

      await client.query(
         `INSERT INTO user_emails (user_id, email, delivery_email, is_primary, is_verified, verified_at)
          VALUES ($1, $2, $3, TRUE, TRUE, NOW())`,
         [user.id, data.email, data.deliveryEmail],
      );

      await client.query(
         `INSERT INTO user_credentials (user_id, password_hash)
          VALUES ($1, $2)`,
         [user.id, data.passwordHash],
      );

      await client.query(
         `INSERT INTO password_history (user_id, password_hash)
          VALUES ($1, $2)`,
         [user.id, data.passwordHash],
      );

      await client.query('COMMIT');

      return {
         id: user.id,
         public_id: user.public_id,
         username: user.username,
         status: 'active',
         email: data.email,
         is_verified: true,
         password_hash: data.passwordHash,
         is_two_factor_enabled: false,
         two_factor_secret: null,
         first_name: data.firstName,
         last_name: data.lastName,
         avatar_id: null,
         delivery_email: data.deliveryEmail,
      };
   } catch (err) {
      await client.query('ROLLBACK');
      throw err;
   } finally {
      client.release();
   }
};
