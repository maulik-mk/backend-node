import sharp from 'sharp';

import { AppError } from '#common/errors/appError.js';
import { generateId } from '#common/utils/snowflake.js';
import logger from '#common/utils/logger.js';
import { azureStorage } from '#config/connection/buckets/azure.js';

/**
 * Service for processing and storing user profile avatars.
 */
export const avatarService = {
   /**
    * Process a raw image buffer, convert to 1:1 JPEG, and upload to secure storage.
    * Path: /upa/{snowflakeId}
    */
   uploadAvatar: async (buffer: Buffer): Promise<string> => {
      const containerClient = azureStorage.getContainerClient();
      if (!containerClient) {
         throw new AppError(
            'Something went wrong while uploading the image. Please try again later.',
            500,
         );
      }

      // 1. Process image with sharp: 1:1 crop, resize to 400x400, convert to jpeg
      let processedBuffer: Buffer;
      try {
         processedBuffer = await sharp(buffer)
            .resize(400, 400, {
               fit: 'cover',
               position: 'center',
               kernel: 'lanczos3',
            })
            .sharpen()
            .toFormat('jpeg', {
               quality: 90,
               mozjpeg: true,
            })
            .toBuffer();
      } catch (err) {
         logger.error({ err }, 'Avatar image processing failed.');
         throw new AppError('The image provided could not be processed.', 400);
      }

      // 2. Generate unique Snowflake ID
      const avatarId = generateId();
      const blobName = `${avatarId}.jpeg`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // 3. Upload to storage
      try {
         await blockBlobClient.uploadData(processedBuffer, {
            blobHTTPHeaders: {
               blobContentType: 'image/jpeg',
               blobCacheControl: 'public, max-age=31536000', // 1 year cache
            },
         });
         return avatarId;
      } catch (err) {
         logger.error({ err }, 'Avatar image upload to storage failed.');
         throw new AppError('The image could not be saved at this time.', 500);
      }
   },

   /** Delete an avatar from storage */
   deleteAvatar: async (avatarId: string): Promise<void> => {
      const containerClient = azureStorage.getContainerClient();
      if (!containerClient) return;

      const blobName = `${avatarId}.jpeg`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      try {
         await blockBlobClient.deleteIfExists();
      } catch (err) {
         logger.warn({ avatarId, err }, 'Failed to delete avatar from storage.');
      }
   },
};
