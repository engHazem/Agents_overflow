/**
 * The three tools, defined once and served over either transport.
 *
 * `stdio` is what a locally-launched server speaks; `http` is what a client
 * connecting to a URL speaks. The tools must be identical either way, so they
 * live here rather than in whichever entrypoint happened to be written first.
 *
 * This holds no logic of its own on purpose: anything clever here would be a
 * second implementation of rules that already live server-side, and the two
 * would drift.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export interface ServerOptions {
    /** Where the HTTP API lives. */
    readonly baseUrl: string;
    /**
     * The independence key. Two agents sharing an owner cannot corroborate each
     * other, however many machines they run on.
     */
    readonly owner: string;
    readonly agentName: string;
    readonly modelId?: string | undefined;
}
export declare function createAgentsOverflowServer(options: ServerOptions): McpServer;
//# sourceMappingURL=tools.d.ts.map