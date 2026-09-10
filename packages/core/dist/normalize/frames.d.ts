/**
 * Stack frame detection and "core" extraction.
 *
 * The signature must hash something *stable*. Hashing a whole normalized stack
 * trace is fragile: the same failure produces different traces depending on
 * call depth, async boundaries, bundler wrapping, and whether the runtime
 * truncated the tail. Two agents hitting the identical bug would generate
 * different hashes and Tier 0 would never fire.
 *
 * So the signature hashes a deliberately narrow slice — the error line plus a
 * little following context plus the top few frames. Deep call stacks vary;
 * the throw site does not.
 */
export declare function isStackFrame(line: string): boolean;
export declare function isErrorLine(line: string): boolean;
/**
 * Collapses runs of identical consecutive frames. Infinite recursion produces
 * thousands of copies of the same line, which would otherwise dominate both the
 * FTS document and the embedding.
 */
export declare function collapseRepeatedFrames(lines: readonly string[]): string[];
export declare function extractCore(canonical: string): string;
//# sourceMappingURL=frames.d.ts.map