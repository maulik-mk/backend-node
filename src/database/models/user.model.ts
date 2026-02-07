export type AccountStatus =
   | 'pending_verification'
   | 'active'
   | 'suspended'
   | 'locked'
   | 'deactivated';

export interface UserRow {
   id: string;
   public_id: string;
   username: string;
   status: AccountStatus;
   created_at: Date;
   updated_at: Date;
}

export interface UserProfileRow {
   id: string;
   user_id: string;
   first_name: string;
   last_name: string;
   birth_date: Date;
   country: string;
   avatar_id: string | null;
   updated_at: Date;
}

export interface UserEmailRow {
   id: string;
   user_id: string;
   email: string;
   is_primary: boolean;
   is_verified: boolean;
   verified_at: Date | null;
   created_at: Date;
}

export interface UserCredentialRow {
   id: string;
   user_id: string;
   password_hash: string;
   password_changed_at: Date;
   two_factor_secret: string | null;
   is_two_factor_enabled: boolean;
   updated_at: Date;
}

export interface PasswordHistoryRow {
   id: string;
   user_id: string;
   password_hash: string;
   created_at: Date;
}

export interface UserSessionRow {
   id: string;
   session_id: string;
   user_id: string;
   token_hash: string;
   ip_address: string;
   user_agent: string | null;
   browser: string | null;
   os: string | null;
   device_type: string;
   location: string | null;
   latitude: number | null;
   longitude: number | null;
   is_active: boolean;
   created_at: Date;
   last_accessed_at: Date;
   expires_at: Date;
   revoked_at: Date | null;
}

export interface LoginAttemptRow {
   id: string;
   user_id: string | null;
   identifier: string;
   ip_address: string;
   user_agent: string | null;
   success: boolean;
   failure_reason: string | null;
   created_at: Date;
}

export interface AuthUserRow {
   id: string;
   public_id: string;
   username: string;
   status: AccountStatus;
   email: string;
   is_verified: boolean;
   password_hash: string;
   is_two_factor_enabled: boolean;
   two_factor_secret: string | null;
   first_name: string;
   last_name: string;
   avatar_id: string | null;
   delivery_email: string | null;
}

export interface UserProfileDTO {
   id: string;
   public_id: string;
   username: string;
   status: AccountStatus;
   created_at: Date;
   updated_at: Date;
   first_name: string;
   last_name: string;
   birth_date: Date;
   country: string;
   email: string;
   delivery_email: string;
   is_verified: boolean;
   is_two_factor_enabled: boolean;
   avatar_id: string | null;
}

export interface UserDTO {
   publicId: string;
   firstName: string;
   lastName: string;
   username: string;
   email: string;
   deliveryEmail: string;
   birthDate: string;
   country: string;
   status: AccountStatus;
   isTwoFactorEnabled: boolean;
   createdAt: Date;
   updatedAt: Date;
}

export const toDTO = (row: UserProfileDTO): UserDTO => ({
   publicId: row.public_id,
   firstName: row.first_name,
   lastName: row.last_name,
   username: row.username,
   email: row.email,
   deliveryEmail: row.delivery_email,
   birthDate: row.birth_date.toISOString().split('T')[0],
   country: row.country,
   status: row.status,
   isTwoFactorEnabled: row.is_two_factor_enabled,
   createdAt: row.created_at,
   updatedAt: row.updated_at,
});
