import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, {} from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerCommunityRoutes } from './community.js';
import { registerMcpHttp } from './mcp-http.js';
import { createContext, loadConfig } from './context.js';
import { registerRoutes } from './routes.js';
export async function buildServer() {
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
    await app.register(cors, { origin: true, credentials: true });
    await app.register(cookie, { secret: config.sessionSecret });
    await registerAuthRoutes(app, ctx);
    await registerMcpHttp(app, ctx);
    await registerRoutes(app, ctx);
    await registerCommunityRoutes(app, ctx);
    return { app, ctx };
}
//# sourceMappingURL=server.js.map