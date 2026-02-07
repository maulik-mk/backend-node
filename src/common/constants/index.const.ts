export const ALLOWED_EMAIL_DOMAINS = [
   'gmail.com',
   'outlook.com',
   'hotmail.com',
   'live.com',
   'icloud.com',
] as const;

export const BCRYPT_SALT_ROUNDS = 12;
export const PASSWORD_HISTORY_LIMIT = 5;

export const SIGNUP_COOKIE_NAME = 'signup_session';
export const SESSION_TOKEN_COOKIE = 'session_token';
export const SESSION_STRICT_COOKIE = '__session_same_site';
export const DEVICE_ID_COOKIE = '_device_id';
export const LOGGED_IN_COOKIE = 'logged_in';
export const USER_DISPLAY_COOKIE = 'dotcom_user';
export const TIMEZONE_COOKIE = 'tz';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_TTL = 3600;

export const REDIS_PREFIX = {
   SIGNUP: 'signup:',
   OTP_ATTEMPTS: 'otp_attempts:',
   SESSION: 'session:',
   USER_SESSIONS: 'user_sessions:',
   FAILED_LOGINS: 'failed_logins:',
   LOCKOUT: 'lockout:',
   PASSWORD_RESET_OTP: 'pass_reset_otp:',
   PASSWORD_RESET_LINK: 'pass_reset_link:',
   LOGIN_2FA: 'login_2fa:',
   PASSWORD_CHANGE_OTP: 'pass_change_otp:',
   DELIVERY_EMAIL_OTP: 'delivery_email:',
   TWO_FA_SETUP: '2fa_setup:',
   SESSION_GENERATION: 'session_gen:',
   ROTATED_SESSION: 'rotated_session:',
} as const;

export const RATE_LIMIT = {
   GLOBAL: { max: 100, timeWindow: '1 minute' },
   SIGNUP: { max: 5, timeWindow: '15 minutes' },
   VERIFY_OTP: { max: 10, timeWindow: '15 minutes' },
   RESEND_OTP: { max: 3, timeWindow: '5 minutes' },
   SIGNIN: { max: 5, timeWindow: '15 minutes' },
   SIGNIN_2FA: { max: 5, timeWindow: '15 minutes' },
   SIGNOUT: { max: 10, timeWindow: '15 minutes' },
   SIGNOUT_ALL: { max: 3, timeWindow: '15 minutes' },
   SESSIONS_LIST: { max: 10, timeWindow: '1 minute' },
   VERIFY_RESET_OTP: { max: 5, timeWindow: '5 minutes' },
   VERIFY_RESET_LINK: { max: 5, timeWindow: '5 minutes' },
   RESET_PASSWORD: { max: 3, timeWindow: '15 minutes' },
} as const;

export const MAX_RESET_OTP_ATTEMPTS = 5;
export const MAX_SESSIONS_PER_USER = 5;
export const TOKEN_ROTATION_INTERVAL = 900;
export const ROTATED_TOKEN_GRACE_PERIOD = 60;
