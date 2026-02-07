import { type Static, Type } from '@sinclair/typebox';

import { OtpSchema, SnowflakeIdSchema } from '#common/schemas/index.schem.js';

export const SigninBody = Type.Object({
   identifier: Type.String({ minLength: 3, maxLength: 255 }),
   password: Type.String({ minLength: 1, maxLength: 64 }),
});

export const Signin2FA = Type.Object({
   sessionId: SnowflakeIdSchema,
   token: OtpSchema,
});

export type SigninDTO = Static<typeof SigninBody>;
export type Signin2FADTO = Static<typeof Signin2FA>;
export const signinRouteSchema = { body: SigninBody };
export const signin2FARouteSchema = { body: Signin2FA };
