import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import env from '#config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templateCache = new Map<string, string>();

const loadTemplate = (name: string): string => {
   const cached = templateCache.get(name);
   if (cached) return cached;

   const filePath = join(__dirname, `${name}.html`);
   const content = readFileSync(filePath, 'utf-8');
   templateCache.set(name, content);
   return content;
};

export const renderOtpEmail = (otp: string, expiryMinutes = 5): string => {
   let html = loadTemplate('otp');
   html = html.replaceAll('{{OTP}}', otp);
   html = html.replaceAll('{{EXPIRY_MINUTES}}', expiryMinutes.toString());
   html = html.replaceAll('{{APP_NAME}}', env.APP_NAME);
   html = html.replaceAll('{{YEAR}}', new Date().getFullYear().toString());
   return html;
};

export const renderPasswordResetEmail = (otp: string, resetLink: string): string => {
   let html = loadTemplate('password-reset');
   html = html.replaceAll('{{OTP}}', otp);
   html = html.replaceAll('{{RESET_LINK}}', resetLink);
   html = html.replaceAll('{{APP_NAME}}', env.APP_NAME);
   html = html.replaceAll('{{YEAR}}', new Date().getFullYear().toString());
   return html;
};

export const renderErrorPage = (statusCode: number): string => {
   const templateName = statusCode === 404 ? '404' : statusCode === 403 ? '403' : '500';
   let html = loadTemplate(templateName);
   
   html = html.replaceAll('{{APP_NAME}}', env.APP_NAME);
   return html;
};