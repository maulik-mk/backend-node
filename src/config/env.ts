import { type Static, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvSchema = Type.Object({
   NODE_ENV: Type.Union(
      [Type.Literal('development'), Type.Literal('production'), Type.Literal('test')],
      { default: 'development' },
   ),
   PORT: Type.Number({ default: 3000 }),
   DB_HOST: Type.String(),
   DB_PORT: Type.Number({ default: 5432 }),
   DB_USER: Type.String(),
   DB_PASSWORD: Type.String(),
   DB_NAME: Type.String(),
   REDIS_URL: Type.String(),
   OTP_TTL: Type.Number({ default: 300 }),
   SESSION_TTL: Type.Number({ default: 604800 }),
   SESSION_IDLE_TTL: Type.Number({ default: 1800 }),
   COOKIE_SECRET: Type.String({ minLength: 32 }),
   COOKIE_DOMAIN: Type.Optional(Type.String()),
   CORS_ORIGIN: Type.String(),
   OTP_MAX_ATTEMPTS: Type.Number({ default: 5 }),
   SIGNUP_RATE_LIMIT: Type.Number({ default: 5 }),
   IPINFO_TOKEN: Type.Optional(Type.String()),
   RESET_TOKEN_SECRET: Type.String({ minLength: 32 }),
   ENCRYPTION_DECRYPTION_SECRET: Type.String({ minLength: 16 }),
   ENCRYPTION_DECRYPTION_SALT: Type.String({ minLength: 8 }),
   AZURE_COMM_CONNECTION_STRING: Type.Optional(Type.String()),
   AZURE_COMM_ENDPOINT: Type.Optional(Type.String()),
   AZURE_EMAIL_SENDER: Type.Optional(Type.String()),
   APP_NAME: Type.String({ default: 'User API' }),
   MACHINE_ID: Type.Number({ default: 1 }),
   COSMOS_ENDPOINT: Type.Optional(Type.String()),
   COSMOS_KEY: Type.Optional(Type.String()),
   AZURE_STORAGE_ACCOUNT_URL: Type.Optional(Type.String()),
   AZURE_STORAGE_CONTAINER_NAME_AVATAR: Type.String({ default: 'upa' }),
   AZURE_CLIENT_ID: Type.Optional(Type.String()),
   FRONTEND_URL: Type.String({ default: 'http://localhost:5173' }),
});

const coercedEnv: Record<string, unknown> = { ...process.env };
const numberFields = [
   'PORT',
   'DB_PORT',
   'OTP_TTL',
   'SESSION_TTL',
   'SESSION_IDLE_TTL',
   'OTP_MAX_ATTEMPTS',
   'SIGNUP_RATE_LIMIT',
   'MACHINE_ID',
];

for (const field of numberFields) {
   if (coercedEnv[field] !== undefined) {
      coercedEnv[field] = Number(coercedEnv[field]);
   }
}

const filteredEnv = Object.fromEntries(
   Object.entries(coercedEnv).filter(([, v]) => v !== undefined),
);

const envWithDefaults = Value.Cast(EnvSchema, filteredEnv);

if (!Value.Check(EnvSchema, envWithDefaults)) {
   const errors = [...Value.Errors(EnvSchema, envWithDefaults)];
   console.error('\n[BOOTSTRAP ERROR] Invalid environment configuration:');
   errors.forEach((err) => {
      console.error(`${err.path.slice(1) || 'ROOT'}: ${err.message}`);
   });
   console.error('\nPlease verify your .env file or environment variables.\n');
   process.exit(1);
}

export type Env = Static<typeof EnvSchema>;
const env = envWithDefaults;

export default Object.freeze(env);
