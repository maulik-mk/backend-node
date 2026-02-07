import buildApp from '#app.js';
import redis from '#config/connection/nosql/redis.js';
import pool from '#config/connection/sql/db.js';
import env from '#config/env.js';

const start = async () => {
   const app = await buildApp();

   const shutdown = (signal: string) => {
      app.log.info(`Received ${signal}, shutting down gracefully`);
      void (async () => {
         await app.close();
         await pool.end();
         redis.disconnect();
         process.exit(0);
      })();
   };

   process.on('SIGINT', () => {
      shutdown('SIGINT');
   });
   process.on('SIGTERM', () => {
      shutdown('SIGTERM');
   });

   try {
      await app.listen({ port: env.PORT, host: '127.0.0.1' });
   } catch (err) {
      app.log.error(err);
      process.exit(1);
   }
};

void start();
