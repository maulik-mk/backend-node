import type { FastifyInstance } from 'fastify';

import { AppError } from '#common/errors/appError.js';
import { authenticate } from '#common/middleware/authenticate.middleware.js';
import * as redisService from '#infra/cache/redis.service.js';
import { avatarService } from '#infra/storage/avatar.service.js';
import * as userRepository from '#modules/user/user.repository.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const isValidImageMagicBytes = (buffer: Buffer): boolean => {
   if (buffer.length < 4) return false;
   return buffer.subarray(0, 3).equals(JPEG_MAGIC) || buffer.subarray(0, 4).equals(PNG_MAGIC);
};

export default function profileRoutes(app: FastifyInstance) {
   app.addHook('preHandler', authenticate);

   /**
    * POST /api/v1/user/profile/avatar
    * Upload and process a new profile avatar.
    */
   app.post('/profile/avatar', async (request, reply) => {
      const data = await request.file();
      if (!data) {
         throw new AppError('The uploaded file is missing or invalid.', 400);
      }

      const limitKey = `rate_limit:update_avatar:${request.user?.userId ?? 'anon'}`;
      const attempts = await redisService.incrementWithTTL(limitKey, 86400); // 24 hours
      if (attempts > 2) {
         throw new AppError(
            'You can only change your avatar 2 times per 24 hours. Please try again later.',
            429,
         );
      }

      if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
         throw new AppError('Invalid file type. Only JPEG and PNG images are supported.', 400);
      }

      const buffer = await data.toBuffer();

      if (!isValidImageMagicBytes(buffer)) {
         throw new AppError('The file content does not match a supported image format.', 400);
      }

      if (!request.user)
         throw new AppError('Authentication is required to update your profile.', 401);
      const userId = request.user.userId;

      // 1. Process and upload to Azure
      const avatarId = await avatarService.uploadAvatar(buffer);

      // 2. Fetch current profile to check if we should delete the old avatar
      const currentProfile = await userRepository.findProfileById(userId);
      if (currentProfile?.avatar_id) {
         // Cleanup old avatar asynchronously
         void avatarService.deleteAvatar(currentProfile.avatar_id);
      }

      // 3. Update database
      await userRepository.updateAvatarId(userId, avatarId);

      return reply.send({
         success: true,
         message: 'Avatar updated successfully',
         avatarId,
      });
   });
}
