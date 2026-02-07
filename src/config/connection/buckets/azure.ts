import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

import logger from '#common/utils/logger.js';
import env from '#config/env.js';
import { azureCredential } from '#config/identity.js';

let blobServiceClient: BlobServiceClient | null = null;
let containerClient: ContainerClient | null = null;

if (env.AZURE_STORAGE_ACCOUNT_URL) {
   if (env.AZURE_STORAGE_ACCOUNT_URL.startsWith('https://')) {
      blobServiceClient = new BlobServiceClient(env.AZURE_STORAGE_ACCOUNT_URL, azureCredential);
   } else {
      blobServiceClient = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_ACCOUNT_URL);
   }
   containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME_AVATAR);
} else {
   logger.warn('[STORAGE] AZURE_STORAGE_ACCOUNT_URL is not set. Avatar uploads will fail.');
}

/**
 * Azure Blob Storage Connection Singleton
 */
export const azureStorage = {
   getBlobServiceClient: () => blobServiceClient,
   getContainerClient: () => containerClient,

   /** Ensure the container exists (useful for initial setup) */
   ensureContainer: async () => {
      if (!containerClient) return;
      try {
         if (!(await containerClient.exists())) {
            await containerClient.create({ access: 'blob' });
            logger.info(`[STORAGE] Created container: ${env.AZURE_STORAGE_CONTAINER_NAME_AVATAR}`);
         }
      } catch (err: unknown) {
         logger.warn(
            `[STORAGE] Could not verify/create container: ${err instanceof Error ? err.message : String(err)}. If the container already exists and your credentials are restricted, this is normal.`,
         );
      }
   },
};
