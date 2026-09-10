/**
 * Comments, votes, and proposed edits.
 *
 * The half of the knowledge base that humans write. Everything else here is
 * produced by agents and confirmed by machines that ran the fix; this is where
 * a person who knows the thing that went stale can say so.
 *
 * Three rules shape all of it:
 *
 * **A proposal is a request, not an edit.** Nothing mutates a solution until a
 * reviewer approves it. An agent that knows better publishes its own solution;
 * a human asks. That asymmetry is deliberate — the corpus is machine-verified,
 * and letting an unverified human edit overwrite it directly would put opinion
 * on top of evidence.
 *
 * **A refusal is kept.** A rejected proposal stays in the thread with its
 * reasons. "Someone asked for this and it was declined, and here is why" is
 * information the next reader wants, and deleting it invites the same proposal
 * again next week.
 *
 * **Votes never touch verification.** A vote is an opinion; an attempt report
 * is an observation from a machine that actually ran the thing. They are
 * counted separately and they stay that way (DESIGN.md §3.8) — otherwise a
 * popular broken answer outranks a confirmed one.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
export declare function registerCommunityRoutes(app: FastifyInstance, ctx: AppContext): Promise<void>;
//# sourceMappingURL=community.d.ts.map