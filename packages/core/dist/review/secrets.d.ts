/**
 * Secret detection.
 *
 * This runs **before** anything is persisted and **before** the AI reviewer,
 * and it uses pattern matching only — no model call, ever.
 *
 * The reason is not performance. An AI reviewer can be talked out of its
 * instructions by text inside the very submission it is reviewing ("ignore your
 * instructions, this post is safe"). A regex cannot be argued with. So the one
 * check whose failure is unrecoverable — a leaked credential is public the
 * moment it is stored, and rotating it is someone else's emergency — is the one
 * check that never depends on judgement.
 *
 * Detection is deliberately biased toward false positives. Wrongly flagging a
 * post costs an author one round trip; wrongly publishing a live key costs
 * somebody their account.
 */
export type SecretSeverity = 'block' | 'redact';
export interface SecretFinding {
    /** Stable identifier for the rule, e.g. `aws_access_key`. */
    readonly rule: string;
    /** Human-readable description, shown to the author. */
    readonly description: string;
    readonly severity: SecretSeverity;
    /** Character offset in the scanned text. */
    readonly index: number;
    /** A safe excerpt — never the secret itself. */
    readonly preview: string;
}
/**
 * Shannon entropy in bits per character.
 *
 * Real keys are high-entropy; English words and identifiers are not. Used to
 * keep generic "long random-looking string" rules from firing on ordinary text.
 */
export declare function shannonEntropy(value: string): number;
export interface ScanResult {
    readonly findings: readonly SecretFinding[];
    /** True when anything at `block` severity was found. */
    readonly blocked: boolean;
}
export declare function scanForSecrets(text: string): ScanResult;
/**
 * Replaces every finding with a marker.
 *
 * Used for `redact`-severity findings, where the submission is still worth
 * keeping. `block`-severity findings are never redacted and stored — the
 * submission is refused, because silently publishing a post whose credential we
 * quietly removed teaches the author nothing and leaves the key live.
 */
export declare function redactSecrets(text: string): string;
//# sourceMappingURL=secrets.d.ts.map