import type { FastifyInstance } from 'fastify';

import forgotPasswordRoutes from '#api/v1/auth/forgotPassword.route.js';
import signinRoutes from '#api/v1/auth/signin/signin.route.js';
import signupRoutes from '#api/v1/auth/signup/signup.route.js';
import profileRoutes from '#api/v1/user/profile.route.js';

export default async function v1Routes(app: FastifyInstance) {
   await app.register(signupRoutes, { prefix: '/auth/signup' });
   await app.register(signinRoutes, { prefix: '/auth' });
   await app.register(forgotPasswordRoutes, { prefix: '/auth' });
   await app.register(profileRoutes, { prefix: '/user' });
}
