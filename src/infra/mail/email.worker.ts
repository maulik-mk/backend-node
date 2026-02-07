import { EmailClient } from '@azure/communication-email';
import { Worker } from 'bullmq';

import { decrypt } from '#common/utils/security/encryption.js';
import env from '#config/env.js';
import logger from '#common/utils/logger.js';
import { renderOtpEmail, renderPasswordResetEmail } from '#templates/template.service.js';
import { azureCredential } from '#config/identity.js';

import type { EmailJob } from './email.queue.js';

let azureClient: EmailClient | null = null;

const getAzureClient = (): EmailClient | null => {
   if (azureClient) return azureClient;

   if (env.AZURE_COMM_CONNECTION_STRING) {
      azureClient = new EmailClient(env.AZURE_COMM_CONNECTION_STRING);
   } else if (env.AZURE_COMM_ENDPOINT) {
      azureClient = new EmailClient(env.AZURE_COMM_ENDPOINT, azureCredential);
   }

   return azureClient;
};

const sendViaAzure = async (to: string, subject: string, html: string): Promise<void> => {
   const client = getAzureClient();

   if (!client || !env.AZURE_EMAIL_SENDER) {
      logger.warn({ to, subject }, 'Email provider not configured. Skipping delivery.');
      logger.debug({ html: html.slice(0, 200) }, 'Email content preview');
      return;
   }

   const poller = await client.beginSend({
      senderAddress: env.AZURE_EMAIL_SENDER,
      content: {
         subject,
         html,
      },
      recipients: {
         to: [{ address: to }],
      },
   });

   const result = await poller.pollUntilDone();
   logger.info({ to, subject, status: result.status }, 'Message delivered successfully.');
};

const processEmailJob = async (job: EmailJob): Promise<void> => {
   switch (job.type) {
      case 'otp': {
         const decryptedOtp = await decrypt(job.otp);
         const html = renderOtpEmail(decryptedOtp, job.expiryMinutes);
         await sendViaAzure(job.to, job.subject, html);
         break;
      }
      case 'password-reset': {
         const decryptedOtp = await decrypt(job.otp);
         const decryptedLink = await decrypt(job.resetLink);
         const html = renderPasswordResetEmail(decryptedOtp, decryptedLink);
         await sendViaAzure(job.to, job.subject, html);
         break;
      }
   }
};

export const startEmailWorker = (): Worker => {
   const worker = new Worker(
      'email',
      async (job) => {
         logger.info({ to: (job.data as EmailJob).to }, 'Processing outgoing message.');
         await processEmailJob(job.data as EmailJob);
      },
      {
         connection: {
            url: env.REDIS_URL,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
         },
         concurrency: 5,
         limiter: {
            max: 30,
            duration: 60_000,
         },
      },
   );

   worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Message processed successfully.');
   });

   worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, 'Message delivery failed.');
   });

   logger.info('Email worker initialized.');
   return worker;
};
