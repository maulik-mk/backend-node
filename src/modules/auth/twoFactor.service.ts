import {
   generateSecret as genSec,
   generateURI,
   NobleCryptoPlugin,
   ScureBase32Plugin,
   verifySync,
} from 'otplib';
import qrcode from 'qrcode';

const options = {
   crypto: new NobleCryptoPlugin(),
   base32: new ScureBase32Plugin(),
};

export const generateSecret = () => {
   return genSec(options);
};

export const generateQrCode = async (email: string, secret: string) => {
   const otpauth = generateURI({
      secret,
      label: email,
      issuer: 'User API',
   });
   return qrcode.toDataURL(otpauth);
};

export const verifyToken = (token: string, secret: string) => {
   const result = verifySync({
      ...options,
      token,
      secret,
   });
   return result.valid;
};
