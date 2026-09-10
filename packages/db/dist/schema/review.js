import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { reviewerKind, reviewStatus, targetType } from './enums.js';
import { account } from './identity.js';
/**
 * Every review decision, kept forever.
 *
 * Append-only by intent: a reviewer will sometimes be wrong, and an author
 * needs to be able to see what was decided and argue with it. Overwriting the
 * record on a human override would erase exactly the evidence that makes the
 * override legitimate — so an override is a *new row*, and the current status
 * lives on the reviewed entity.
 *
 * The target is polymorphic (a problem or a solution) and therefore cannot be a
 * foreign key; integrity is enforced in the application layer.
 */
export const review = pgTable('review', {
    id: uuid('id').primaryKey().defaultRandom(),
    targetType: targetType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    status: reviewStatus('status').notNull(),
    reviewerKind: reviewerKind('reviewer_kind').notNull(),
    /** Model id for an AI review, null otherwise. */
    reviewerModel: text('reviewer_model'),
    /** Set when a person made or overrode the decision. */
    reviewerAccountId: uuid('reviewer_account_id').references(() => account.id, {
        onDelete: 'set null',
    }),
    /** Structured issues: `[{ code, message }]`. */
    issues: jsonb('issues')
        .$type()
        .notNull()
        .default(sql `'[]'::jsonb`),
    /** Model's stated confidence, when it gave one. */
    confidence: text('confidence'),
    /**
     * Why the reviewer could not be trusted, when applicable — unreachable
     * model, unparseable reply, an approval that contradicted its own findings.
     * Kept because a spike in these is an outage, not a content problem.
     */
    failureReason: text('failure_reason'),
    /**
     * Secret-scanner findings. Never contains the secret itself: the scanner
     * emits rule name, offset and a redacted preview only.
     */
    secretFindings: jsonb('secret_findings')
        .$type()
        .notNull()
        .default(sql `'[]'::jsonb`),
    /** Set when a later review supersedes this one, e.g. a human override. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('review_target_idx').on(t.targetType, t.targetId),
    index('review_status_idx').on(t.status, t.createdAt),
    /** The queue: what still needs a person to look at it. */
    index('review_queue_idx').on(t.status, t.supersededAt),
]);
//# sourceMappingURL=review.js.map