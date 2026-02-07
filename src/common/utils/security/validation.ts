import { ALLOWED_EMAIL_DOMAINS } from '#common/constants/index.const.js';

const ALIAS_SUPPORTED_DOMAINS = [
   'gmail.com',
   'googlemail.com',
   'outlook.com',
   'hotmail.com',
   'live.com',
   'icloud.com',
   'protonmail.com',
   'yahoo.com',
] as const;

interface NormalizedEmail {
   canonical: string;
   delivery: string;
}

export const normalizeEmail = (email: string): NormalizedEmail => {
   const trimmed = email.trim().toLowerCase();
   const [localPart, domain] = trimmed.split('@');

   if (!localPart || !domain) {
      return { canonical: trimmed, delivery: trimmed };
   }

   const delivery = trimmed;

   if ((ALIAS_SUPPORTED_DOMAINS as readonly string[]).includes(domain)) {
      const baseLocal = localPart.split('+')[0];
      return { canonical: `${baseLocal}@${domain}`, delivery };
   }

   return { canonical: trimmed, delivery };
};

export const isAllowedDomain = (email: string): boolean => {
   const domain = email.split('@')[1]?.toLowerCase();
   return ALLOWED_EMAIL_DOMAINS.includes(domain as (typeof ALLOWED_EMAIL_DOMAINS)[number]);
};

export const sanitizeInput = (input: string): string => {
   return (
      input
         .normalize('NFC')
         // eslint-disable-next-line no-control-regex
         .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
         .replace(/[<>]/g, '')
         .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;')
         .trim()
   );
};
