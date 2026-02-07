import { createHash, randomInt } from 'node:crypto';

import { timingSafeCompare } from '#common/utils/security/token.js';

export const generateOtp = (): string => {
   return randomInt(100000, 999999).toString();
};

export const hashOtp = (otp: string): string => {
   return createHash('sha256').update(otp).digest('hex');
};

export const verifyOtp = (input: string, storedHash: string): boolean => {
   const inputHash = hashOtp(input);
   return timingSafeCompare(inputHash, storedHash);
};
