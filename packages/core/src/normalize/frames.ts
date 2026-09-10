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

/** How many stack frames enter the core. Enough to disambiguate, few enough to stay stable. */
const CORE_FRAME_COUNT = 3;

/** Context lines kept after the error line when the message wraps. */
const CORE_CONTEXT_LINES = 2;

/** Fallback slice when no error line and no frames can be identified. */
const CORE_FALLBACK_LINES = 5;

const FRAME_PATTERNS: readonly RegExp[] = [
  /^\s*at\s+\S/, // JavaScript, Java (`\tat com.foo.Bar`)
  /^\s*File\s+"/, // Python
  /^\s*#\d+\s+\S/, // gdb, PHP/Xdebug
  /^\s*from\s+\S+:.*:in\s+/, // Ruby
  /^\s*\d+:\s+\S/, // Rust backtrace
  /^\s*in\s+\S+\s+\(at\s+/, // React component stacks
];

/**
 * Recognises an error-announcing line across the ecosystems agents actually
 * work in. Matters because the error is often buried far down a build log
 * rather than sitting on the first line.
 */
const ERROR_LINE_PATTERNS: readonly RegExp[] = [
  /\b[A-Z][A-Za-z0-9_.]*(?:Error|Exception|Fault|Panic)\b\s*:/, // TypeError:, java.lang.NullPointerException:
  /\berror\s+TS\d+\s*:/i, // TypeScript
  /\berror\[[A-Z]\d+\]\s*:/i, // Rust
  /\b[A-Z]{2,}[0-9]*\b.*\berror\b/i, // ENOENT, EACCES style codes
  /^\s*(?:error|fatal|panic)\b\s*[:\]]/i, // generic tool output
  /\bcannot find\b|\bmodule not found\b|\bfailed to\b/i, // common phrasings
];

export function isStackFrame(line: string): boolean {
  return FRAME_PATTERNS.some((re) => re.test(line));
}

export function isErrorLine(line: string): boolean {
  return ERROR_LINE_PATTERNS.some((re) => re.test(line));
}

/**
 * Collapses runs of identical consecutive frames. Infinite recursion produces
 * thousands of copies of the same line, which would otherwise dominate both the
 * FTS document and the embedding.
 */
export function collapseRepeatedFrames(lines: readonly string[]): string[] {
  const out: string[] = [];
  let previous: string | null = null;
  let repeats = 0;

  for (const line of lines) {
    const key = line.trim();
    if (key === previous && isStackFrame(line)) {
      repeats += 1;
      continue;
    }
    if (repeats > 0) {
      out.push(`... x${repeats + 1} repeated frames`);
      repeats = 0;
    }
    out.push(line);
    previous = key;
  }
  if (repeats > 0) out.push(`... x${repeats + 1} repeated frames`);

  return out;
}

/**
 * Extracts the stable slice used for the signature hash.
 *
 * Takes the first recognisable error line (not the first line — build logs bury
 * the error), a couple of continuation lines, and the top few frames.
 */
/**
 * A line that continues the error message rather than starting new output.
 *
 * Only continuations may join the core. Taking whatever two lines happen to
 * follow the error would let unrelated build-log output into the signature,
 * and the signature would stop being stable precisely in the case that matters
 * most — an error buried in a noisy log.
 *
 * Indentation covers most ecosystems; the marker characters cover Rust and GCC
 * diagnostics, whose context lines carry the actual type mismatch.
 */
function isContinuation(rawLine: string): boolean {
  return /^\s+\S/.test(rawLine) || /^\s*(?:[|^]|-->|\.\.\.)/.test(rawLine);
}

export function extractCore(canonical: string): string {
  const rawLines = canonical.split('\n').filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return '';

  const trimmed = rawLines.map((l) => l.trim());
  const errorIdx = trimmed.findIndex(isErrorLine);
  const frames = trimmed.filter(isStackFrame).slice(0, CORE_FRAME_COUNT);

  if (errorIdx === -1) {
    // No recognisable error line. Fall back to the head, minus frames, so the
    // core is still something rather than an arbitrary log prefix.
    const head = trimmed.filter((l) => !isStackFrame(l)).slice(0, CORE_FALLBACK_LINES);
    return [...head, ...frames].join('\n');
  }

  const context: string[] = [trimmed[errorIdx]!];
  for (let i = errorIdx + 1; i < rawLines.length && context.length <= CORE_CONTEXT_LINES; i += 1) {
    const raw = rawLines[i]!;
    if (isStackFrame(raw) || !isContinuation(raw)) break;
    context.push(trimmed[i]!);
  }

  return [...context, ...frames].join('\n');
}
