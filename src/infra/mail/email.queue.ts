import { Queue } from 'bullmq';

import env from '#config/env.js';

const connection = {
   url: env.REDIS_URL,
   maxRetriesPerRequest: null,
   enableReadyCheck: false,
   tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
};

export const emailQueue = new Queue('email', {
   connection,
   defaultJobOptions: {
      attempts: 3,
      backoff: {
         type: 'exponential',
         delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
   },
});

export interface OtpEmailJob {
   type: 'otp';
   to: string;
   otp: string;
   expiryMinutes: number;
   subject: string;
}

export interface PasswordResetEmailJob {
   type: 'password-reset';
   to: string;
   otp: string;
   resetLink: string;
   subject: string;
}

export type EmailJob = OtpEmailJob | PasswordResetEmailJob;

export const addEmailJob = async (job: EmailJob): Promise<void> => {
   await emailQueue.add(job.type, job, {
      jobId: `${job.type}:${job.to}:${String(Date.now())}`,
   });
};
