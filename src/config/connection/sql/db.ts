import pg from 'pg';

import env from '#config/env.js';

const pool = new pg.Pool({
   host: env.DB_HOST,
   port: env.DB_PORT,
   user: env.DB_USER,
   password: env.DB_PASSWORD,
   database: env.DB_NAME,
   max: 20,
   idleTimeoutMillis: 30000,
   connectionTimeoutMillis: 5000,
   ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export default pool;
