import { type Static, Type } from '@sinclair/typebox';

import {
   EmailSchema,
   OtpSchema,
   PasswordSchema,
   UsernameSchema,
} from '#common/schemas/index.schem.js';

export const SignupBody = Type.Object({
   firstName: Type.String({ minLength: 2, maxLength: 50 }),
   lastName: Type.String({ minLength: 2, maxLength: 50 }),
   username: UsernameSchema,
   email: EmailSchema,
   password: PasswordSchema,
   birthDate: Type.String({ format: 'date' }),
   country: Type.String({ minLength: 2, maxLength: 100 }),
});

export const VerifyOtpBody = Type.Object({
   otp: OtpSchema,
});

export type SignupDTO = Static<typeof SignupBody>;
export type VerifyOtpDTO = Static<typeof VerifyOtpBody>;

export const signupRouteSchema = { body: SignupBody };
export const verifyOtpRouteSchema = { body: VerifyOtpBody };
