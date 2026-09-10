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
export const REDACT_RULES: readonly RedactRule[] = [
  // Terminal colour codes. Agents frequently capture styled output verbatim.
  { name: 'ansi', re: new RegExp('\\x1b\\[[0-9;]*[A-Za-z]', 'g'), replacement: '' },

  /**
   * Windows path separators become POSIX ones before any path rule runs.
   *
   * Without this the same error on Linux and Windows normalizes to different
   * text — `ioredis/built/Redis.js` versus `ioredis\built\Redis.js` — which
   * yields different signatures and silently defeats the exact-match fast path
   * in exactly the cross-platform case it exists to serve.
   *
   * Constrained to separators between path characters so escape sequences in
   * quoted strings are left alone. `:` is included in the lookbehind for the
   * drive-letter separator in `C:\Users` — without it that one backslash
   * survives and the Windows path rule never matches.
   */
  { name: 'win_sep', re: /(?<=[\w.@+:-])\\(?=[\w.@+-])/g, replacement: '/' },

  // Before any path rule, or the pathname of a URL is mistaken for a path.
  { name: 'url', re: /\b(?:https?|ws|wss|ftp):\/\/[^\s"'<>)\]]+/g, replacement: '<url>' },

  { name: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '<email>' },

  {
    name: 'uuid',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: '<uuid>',
  },

  {
    name: 'timestamp',
    re: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
    replacement: '<timestamp>',
  },

  // Keep the package name — `<node_modules>/react/index.js` still says which
  // dependency failed, which is exactly the signal we want to match on.
  {
    name: 'node_modules',
    re: /(?:[A-Za-z]:)?\/?(?:[\w.@+-]+\/)*node_modules\/(?:\.pnpm\/[^/\s]+\/node_modules\/)?/g,
    replacement: '<node_modules>/',
  },

  // Directory portion becomes a placeholder; the basename survives because the
  // failing file's name carries information while its location does not.
  // Separators are already POSIX by this point, so the drive letter is all that
  // distinguishes a Windows path.
  {
    name: 'win_path',
    re: /[A-Za-z]:\/(?:[^/\s:"'<>|?*]+\/)*([^/\s:"'<>|?*]+)/g,
    replacement: '<path>/$1',
  },
  /**
   * The lookbehind keeps this from consuming a path that is already a relative
   * remainder of an earlier substitution. `>` excludes text the `node_modules`
   * rule just produced (whose package name it deliberately preserved), and `\w`
   * excludes continuing into the middle of that same relative path.
   */
  {
    name: 'posix_path',
    re: /(?<![\w>])\/(?:[\w.@+-]+\/)+([\w.@+-]+)/g,
    replacement: '<path>/$1',
  },

  { name: 'hex_addr', re: /\b0x[0-9a-fA-F]+\b/g, replacement: '<addr>' },

  // Git SHAs, content hashes, cache keys. The digit lookahead keeps words made
  // only of hex letters (`acceded`, `defaced`) from matching.
  {
    name: 'hash',
    re: /\b(?=[0-9a-f]*\d)[0-9a-f]{7,64}\b/g,
    replacement: '<hash>',
  },

  { name: 'ip', re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '<ip>' },

  // Must follow `ip`, so `127.0.0.1:5432` has already become `<ip>:5432`.
  // No leading \b: the alternatives can start with `<`, which is not a word
  // character, so a word boundary could never match there.
  {
    name: 'port',
    re: /(localhost|<ip>|\[::1\]):\d{2,5}\b/g,
    replacement: '$1:<port>',
  },

  { name: 'line_col', re: /:(\d+):(\d+)\b/g, replacement: ':<line>:<col>' },
  { name: 'line_ref', re: /\b(line|Line|LINE)\s+\d+/g, replacement: '$1 <line>' },
  { name: 'pid', re: /\b(pid|PID|process)\s+#?\d+/g, replacement: '$1 <pid>' },
] as const;

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
export function redact(input: string): RedactResult {
  let text = input;
  const counts: Record<string, number> = {};

  for (const rule of REDACT_RULES) {
    let hits = 0;
    text = text.replace(rule.re, (...args) => {
      hits += 1;
      // Groups sit between the match and the offset/string trailers.
      const groups = args.slice(1, -2) as (string | undefined)[];
      return rule.replacement.replace(/\$(\d)/g, (_, d: string) => groups[Number(d) - 1] ?? '');
    });
    if (hits > 0) counts[rule.name] = hits;
  }

  return { text, counts };
}
