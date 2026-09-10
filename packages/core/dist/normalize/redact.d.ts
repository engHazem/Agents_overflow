/**
 * Ordered redaction rules that strip environment-specific noise from raw error
 * output while preserving the parts that identify the error.
 *
 * Order is load-bearing. Several rules would otherwise consume text a later,
 * more specific rule needs — URLs must be replaced before generic POSIX paths
 * or the path rule eats their pathname; `node_modules` prefixes must be handled
 * before generic paths or the package name (real signal) is lost with the
 * user-specific directory (noise).
 */
export interface RedactRule {
    /** Stable identifier, used as the key in the redaction counts. */
    readonly name: string;
    readonly re: RegExp;
    readonly replacement: string;
}
/**
 * Applied top to bottom. Every regex must carry the `g` flag.
 */
export declare const REDACT_RULES: readonly RedactRule[];
export interface RedactResult {
    readonly text: string;
    /** Rule name to number of substitutions made. Rules that never fired are absent. */
    readonly counts: Readonly<Record<string, number>>;
}
/**
 * Applies every rule in order, counting substitutions for observability — a
 * sudden shift in redaction counts is the earliest signal that upstream output
 * formats have changed.
 */
export declare function redact(input: string): RedactResult;
//# sourceMappingURL=redact.d.ts.map