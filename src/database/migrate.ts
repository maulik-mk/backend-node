import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import logger from '#common/utils/logger.js';
import pool from '#config/connection/sql/db.js';

interface MigrationRow {
   filename: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsPath = join(__dirname, 'migrations');

const migrate = async () => {
   try {
      await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE,
        run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

      const result = await pool.query('SELECT filename FROM migrations');
      const rows = result.rows as MigrationRow[];
      const executed = rows.map((r) => r.filename);

      const files = readdirSync(migrationsPath).sort();

      for (const file of files) {
         if (!executed.includes(file)) {
            logger.info({ file }, 'Executing database migration.');
            const sql = readFileSync(join(migrationsPath, file), 'utf-8');

            const client = await pool.connect();
            try {
               await client.query('BEGIN');
               await client.query(sql);
               await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
               await client.query('COMMIT');
               logger.info({ file }, 'Migration completed successfully.');
            } catch (migrationErr: unknown) {
               await client.query('ROLLBACK');
               logger.error({ file, err: migrationErr }, 'Migration failed. Changes rolled back.');
               throw migrationErr;
            } finally {
               client.release();
            }
         }
      }
      logger.info('All database migrations completed successfully.');
   } catch (err: unknown) {
      logger.error({ err }, 'Migration script failed execution.');
      process.exit(1);
   } finally {
      await pool.end();
   }
};

void migrate();
