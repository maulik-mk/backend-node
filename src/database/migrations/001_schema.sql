CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUM TYPES
CREATE TYPE account_status AS ENUM (
    'pending_verification',
    'active',
    'suspended',
    'locked',
    'deactivated'
);

-- 2. AUTO-UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. CORE IDENTITY TABLE
CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id       VARCHAR(28)     NOT NULL UNIQUE,
    username        VARCHAR(30)     NOT NULL UNIQUE,
    status          account_status  NOT NULL DEFAULT 'pending_verification',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_public_id ON users (public_id);
CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username));
CREATE INDEX idx_users_status ON users (status);

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. USER PROFILES (mutable personal data)
CREATE TABLE user_profiles (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name      VARCHAR(50)     NOT NULL,
    last_name       VARCHAR(50)     NOT NULL,
    birth_date      DATE            NOT NULL CHECK (birth_date <= CURRENT_DATE),
    country         VARCHAR(100)    NOT NULL,
    avatar_id       VARCHAR(20)     DEFAULT NULL,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles (user_id);
CREATE INDEX idx_user_profiles_avatar_id ON user_profiles(avatar_id) WHERE avatar_id IS NOT NULL;

CREATE TRIGGER set_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. USER EMAILS (multi-email + alias support)
CREATE TABLE user_emails (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email           VARCHAR(255)    NOT NULL,
    delivery_email  VARCHAR(255)    NOT NULL,
    is_primary      BOOLEAN         NOT NULL DEFAULT FALSE,
    is_verified     BOOLEAN         NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Uniqueness on canonical email — blocks user+tag duplicates
CREATE UNIQUE INDEX idx_user_emails_canonical ON user_emails (LOWER(email));
CREATE INDEX idx_user_emails_user_id ON user_emails (user_id);
-- Each user can have only ONE primary email
CREATE UNIQUE INDEX idx_user_emails_one_primary ON user_emails (user_id) WHERE is_primary = TRUE;

-- 6. USER CREDENTIALS
CREATE TABLE user_credentials (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    password_hash           VARCHAR(255)    NOT NULL,
    password_changed_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    two_factor_secret       VARCHAR(255),
    is_two_factor_enabled   BOOLEAN         NOT NULL DEFAULT FALSE,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_credentials_user_id ON user_credentials (user_id);

CREATE TRIGGER set_user_credentials_updated_at BEFORE UPDATE ON user_credentials
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 7. PASSWORD HISTORY (prevent reuse)
CREATE TABLE password_history (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash   VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_history_user_id ON password_history (user_id);

-- 8. USER SESSIONS (persistent tracking)
CREATE TABLE user_sessions (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          VARCHAR(20)     NOT NULL UNIQUE,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          VARCHAR(128)    NOT NULL,
    ip_address          VARCHAR(16)     NOT NULL,
    browser             VARCHAR(100),
    os                  VARCHAR(100),
    device_type         VARCHAR(30)     DEFAULT 'desktop',
    location            VARCHAR(255),
    latitude            DECIMAL(10, 7),
    longitude           DECIMAL(10, 7),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_accessed_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user_active ON user_sessions (user_id) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_token_hash ON user_sessions (token_hash) WHERE is_active = TRUE;
CREATE INDEX idx_user_sessions_expires ON user_sessions (expires_at) WHERE is_active = TRUE;
