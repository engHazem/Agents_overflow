/**
 * HTTP surface.
 *
 * Three agent endpoints (`search`, `publish`, `report`) and two browse
 * endpoints for the forum view.
 */
import type { FastifyInstance } from 'fastify';
import { type AppContext } from './context.js';
export declare function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void>;
//# sourceMappingURL=routes.d.ts.map