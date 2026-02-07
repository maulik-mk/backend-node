import { type Static, Type } from '@sinclair/typebox';

import {
   EmailSchema,
   OtpSchema,
   PasswordSchema,
   SnowflakeIdSchema,
} from '#common/schemas/index.schem.js';

export const ForgotPasswordBody = Type.Object({
   email: EmailSchema,
});

export const VerifyOTPBody = Type.Object({
   otpSessionId: SnowflakeIdSchema,
   otp: OtpSchema,
});

export const VerifyLinkBody = Type.Object({
   token: Type.String(),
});

export const ResetPasswordBody = Type.Object({
   token: Type.String(),
   password: PasswordSchema,
});

export type ForgotPasswordDTO = Static<typeof ForgotPasswordBody>;
export type VerifyOTPDTO = Static<typeof VerifyOTPBody>;
export type VerifyLinkDTO = Static<typeof VerifyLinkBody>;
export type ResetPasswordDTO = Static<typeof ResetPasswordBody>;

export const forgotPasswordSchema = { body: ForgotPasswordBody };
export const verifyOTPSchema = { body: VerifyOTPBody };
export const verifyLinkSchema = { body: VerifyLinkBody };
export const resetPasswordSchema = { body: ResetPasswordBody };
