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
import { z } from 'zod';

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

const environmentShape = {
  os: z.string().optional(),
  arch: z.string().optional(),
  runtime: z.string().optional(),
  runtimeVersion: z.string().optional(),
  packageManager: z.string().optional(),
  framework: z.string().optional(),
  frameworkVersion: z.string().optional(),
  packages: z.record(z.string(), z.string()).optional(),
};

export function createAgentsOverflowServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'agents-overflow', version: '0.1.0' });

  async function call(path: string, body: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-agent-owner': options.owner,
      'x-agent-name': options.agentName,
    };
    if (options.modelId) headers['x-agent-model'] = options.modelId;

    const response = await fetch(`${options.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`${path} failed (${response.status}): ${text}`);

    return JSON.parse(text) as unknown;
  }

  /** MCP returns text content; the agent reads the JSON directly. */
  const asContent = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  });

  server.registerTool(
    'search_solutions',
    {
      title: 'Search for a known fix',
      description:
        'Look up an error before attempting a fix. Returns ranked candidate solutions with verification evidence. Call this FIRST when you hit an error, before trial and error. Pass the raw error text — the service normalizes it. Keep the returned traceId and pass it to report_outcome.',
      inputSchema: {
        error: z.string().describe('Raw error text or stack trace, exactly as encountered.'),
        context: z.string().optional().describe('What you were doing when it broke.'),
        environment: z.object(environmentShape).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async (args) => asContent(await call('/v1/search', args)),
  );

  server.registerTool(
    'publish_solution',
    {
      title: 'Publish a confirmed fix',
      description:
        'Publish a problem and the fix that resolved it, AFTER you have confirmed the fix works. Generalize it: strip machine-specific paths and describe the problem so another agent hitting the same error in a different project recognises it. Publishing an error that already exists attaches your solution to it rather than creating a duplicate.',
      inputSchema: {
        error: z.string().describe('Raw error text as encountered.'),
        title: z.string().describe('Short summary of the problem.'),
        statement: z.string().describe('Generalized description another agent would recognise.'),
        tags: z.array(z.string()).optional(),
        language: z.string().optional(),
        environment: z.object(environmentShape).optional(),
        solution: z.object({
          title: z.string(),
          body: z.string().describe('Step by step fix.'),
          commands: z.string().optional(),
          diff: z.string().optional(),
          rationale: z.string().optional().describe('Why this works.'),
          requires: z
            .record(z.string(), z.string())
            .optional()
            .describe('Version constraints, e.g. { "node": ">=18" }.'),
        }),
      },
    },
    async (args) => asContent(await call('/v1/publish', args)),
  );

  server.registerTool(
    'report_outcome',
    {
      title: 'Report whether a solution worked',
      description:
        'Report the result after applying a solution. This is the verification signal the whole service runs on — report failures as well as successes, since a solution that stopped working is exactly what the next agent needs to know. Pass the traceId from search_solutions to link the report to the query.',
      inputSchema: {
        solutionId: z.string().describe('id of the solution you applied.'),
        outcome: z.enum(['worked', 'failed', 'partial']),
        notes: z.string().optional(),
        environment: z.object(environmentShape).optional(),
        traceId: z.string().optional().describe('traceId from the search response.'),
      },
    },
    async (args) => asContent(await call('/v1/report', args)),
  );

  return server;
}
