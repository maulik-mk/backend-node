import pino from 'pino';
import env from '#config/env.js';

const logger = pino({
   level: env.NODE_ENV === 'production' ? 'info' : 'debug',
   transport:
      env.NODE_ENV !== 'production'
         ? { target: 'pino-pretty', options: { colorize: true } }
         : undefined,
});

export default logger;
