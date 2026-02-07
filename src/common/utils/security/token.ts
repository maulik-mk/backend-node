import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'upa_';
const CHECKSUM_LENGTH = 6;

export const timingSafeCompare = (a: string, b: string): boolean => {
   const bufA = Buffer.from(a, 'utf8');
   const bufB = Buffer.from(b, 'utf8');

   if (bufA.length !== bufB.length) {
      const padded = Buffer.alloc(bufA.length);
      bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
      timingSafeEqual(bufA, padded);
      return false;
   }

   return timingSafeEqual(bufA, bufB);
};

export const generateSessionToken = (): string => {
   const entropy = randomBytes(32).toString('base64url');

   const checksum = createHash('sha256')
      .update(entropy)
      .digest('base64url')
      .slice(0, CHECKSUM_LENGTH);

   return `${TOKEN_PREFIX}${entropy}${checksum}`;
};

export const verifyTokenChecksum = (token: string): boolean => {
   if (!token.startsWith(TOKEN_PREFIX)) return false;

   const tokenWithoutPrefix = token.slice(TOKEN_PREFIX.length);

   if (tokenWithoutPrefix.length <= CHECKSUM_LENGTH) return false;

   const entropy = tokenWithoutPrefix.slice(0, -CHECKSUM_LENGTH);
   const providedChecksum = tokenWithoutPrefix.slice(-CHECKSUM_LENGTH);

   const expectedChecksum = createHash('sha256')
      .update(entropy)
      .digest('base64url')
      .slice(0, CHECKSUM_LENGTH);

   return timingSafeCompare(providedChecksum, expectedChecksum);
};

export const generatePublicId = (): string => {
   return `usr_${randomBytes(12).toString('hex')}`;
};

export const hashToken = (token: string): string => {
   return createHash('sha256').update(token).digest('hex');
};

export const hashTokenForRedis = (token: string): string => {
   return createHash('sha256').update(token).digest('hex');
};
