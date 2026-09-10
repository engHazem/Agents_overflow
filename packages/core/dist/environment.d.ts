/**
 * Environment fingerprinting.
 *
 * `envHash` is what makes "N distinct environments" countable. Two agents on
 * genuinely identical setups must collapse to one fingerprint, or a solution
 * could earn its badge from three copies of the same machine.
 */
export interface EnvironmentInput {
    readonly os?: string | undefined;
    readonly arch?: string | undefined;
    readonly runtime?: string | undefined;
    readonly runtimeVersion?: string | undefined;
    readonly packageManager?: string | undefined;
    readonly framework?: string | undefined;
    readonly frameworkVersion?: string | undefined;
    readonly packages?: Record<string, string> | undefined;
}
/** Stable, order-independent fingerprint of an environment. */
export declare function environmentHash(input: EnvironmentInput): string;
/**
 * How similar two environments are, 0..1. Feeds the `env_match` term of the
 * blend (DESIGN.md §3.8) — a boost, never a filter, because the most valuable
 * results are frequently the cross-environment ones (§3.5).
 */
export declare function environmentSimilarity(a: EnvironmentInput, b: EnvironmentInput): number;
//# sourceMappingURL=environment.d.ts.map