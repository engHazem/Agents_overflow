/**
 * Version extraction.
 *
 * Versions are pulled out of the *raw* text, before redaction runs, because
 * redaction destroys some of the contexts they appear in — a pnpm store path
 * like `node_modules/.pnpm/react@18.2.0/` collapses to a placeholder and takes
 * the version with it.
 *
 * They are extracted rather than deleted because they are the input to the
 * deterministic precondition check (DESIGN.md §3.6), which is what catches
 * "this solution requires torch <2.3 but the caller has 2.4" — a judgement a
 * reranker cannot reliably make.
 */
const SEMVER = String.raw `\d+(?:\.\d+)*(?:-[\w.]+)?`;
const PATTERNS = [
    // npm specifier: `react@18.2.0`, `@scope/pkg@1.0.0`
    {
        re: new RegExp(String.raw `(@?[a-z0-9._-]+(?:\/[a-z0-9._-]+)?)@(${SEMVER})`, 'gi'),
        subjectGroup: 1,
        versionGroup: 2,
    },
    // Python requirement: `torch==2.4.0`, `numpy>=1.26`
    {
        re: new RegExp(String.raw `([a-z][a-z0-9._-]*)\s*(?:==|>=|<=|~=|!=)\s*(${SEMVER})`, 'gi'),
        subjectGroup: 1,
        versionGroup: 2,
    },
    // Named runtime: `node v20.1.0`, `Python 3.11.4`, `Node.js/18`
    {
        re: new RegExp(String.raw `\b(node(?:\.js)?|python|ruby|go|rust|java|php|deno|bun|npm|pnpm|yarn|vite|webpack|next|react|torch|pytorch|tensorflow)[\s/@v]+v?(${SEMVER})`, 'gi'),
        subjectGroup: 1,
        versionGroup: 2,
    },
    // Bare `v1.2.3` with no attributable subject.
    {
        re: new RegExp(String.raw `\bv(${SEMVER})\b`, 'gi'),
        subjectGroup: 0,
        versionGroup: 1,
    },
];
/**
 * Returns every version reference found, deduplicated on subject + version.
 * A more specific pattern earlier in the list wins over a later bare match.
 */
export function extractVersions(input) {
    const seen = new Set();
    const found = [];
    for (const pattern of PATTERNS) {
        for (const match of input.matchAll(pattern.re)) {
            const version = match[pattern.versionGroup];
            if (version === undefined)
                continue;
            const rawSubject = pattern.subjectGroup === 0 ? undefined : match[pattern.subjectGroup];
            const subject = rawSubject === undefined ? null : rawSubject.toLowerCase();
            // A bare `v1.2.3` inside an already-attributed match is redundant noise.
            const key = `${subject ?? ''}@${version}`;
            if (seen.has(key))
                continue;
            if (subject === null && [...seen].some((k) => k.endsWith(`@${version}`)))
                continue;
            seen.add(key);
            found.push({ subject, version, raw: match[0] });
        }
    }
    return found;
}
//# sourceMappingURL=versions.js.map