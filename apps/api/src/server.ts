import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerAuthRoutes } from './auth.js';
import { registerCommunityRoutes } from './community.js';
import { registerMcpHttp } from './mcp-http.js';
import { createContext, loadConfig, type AppContext } from './context.js';
import { registerRoutes } from './routes.js';

export async function buildServer(): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const config = loadConfig();
  const ctx = createContext(config);

  const app = Fastify({
    logger: { level: config.logLevel },
    // Agents paste whole stack traces; the default 1MB limit would reject them.
    bodyLimit: 4 * 1024 * 1024,
  });

  /**
   * CORS is permissive on origin but must reflect it rather than answer `*`,
   * because the session cookie is only sent when `credentials` is enabled and
   * the spec forbids combining credentials with a wildcard origin.
   *
   * Still too open for production: lock `origin` to known hosts before deploy.
   */
  const allowedOrigin = process.env.ALLOWED_ORIGIN || true;
  await app.register(cors, { origin: allowedOrigin, credentials: true });

  await app.register(cookie, { secret: config.sessionSecret });

  await registerAuthRoutes(app, ctx);
  await registerMcpHttp(app, ctx);
  await registerRoutes(app, ctx);
  await registerCommunityRoutes(app, ctx);

  return { app, ctx };
}
