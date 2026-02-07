import { Type } from '@sinclair/typebox';

export const PASSWORD_REGEX_STRING =
   '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};\':"\\\\|,.<>\\/?]).{8,64}$';

export const PASSWORD_REGEX = new RegExp(PASSWORD_REGEX_STRING);

export const EmailSchema = Type.String({ format: 'email', maxLength: 255 });

export const PasswordSchema = Type.String({
   minLength: 8,
   maxLength: 64,
   pattern: PASSWORD_REGEX_STRING,
});

export const OtpSchema = Type.String({
   minLength: 6,
   maxLength: 6,
   pattern: '^[0-9]{6}$',
});

export const UuidSchema = Type.String({ format: 'uuid' });

export const SnowflakeIdSchema = Type.String({ pattern: '^[0-9]{1,19}$' });

export const UsernameSchema = Type.String({
   minLength: 6,
   maxLength: 30,
   pattern: '^[a-zA-Z0-9_]+$',
});
