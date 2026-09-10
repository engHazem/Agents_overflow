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

interface SecretRule {
  readonly name: string;
  readonly description: string;
  readonly severity: SecretSeverity;
  readonly re: RegExp;
  /**
   * Optional second-stage check. Regexes over-match on placeholder text, and a
   * post that says `sk-YOUR_KEY_HERE` should not be blocked.
   */
  readonly confirm?: (match: string) => boolean;
}

/** Text that looks like a credential but is obviously a placeholder. */
const PLACEHOLDER = /^(?:x{4,}|\*{4,}|\.{3,}|<[^>]+>|\$\{[^}]+\}|your[_-]?|example|placeholder|redacted|dummy|sample|test[_-]?key|changeme|todo)/i;

/**
 * Values that are the *word for* a credential rather than a credential.
 * `postgresql://user:password@localhost/db` is documentation, and blocking it
 * would flag most connection-string examples ever written.
 */
const PLACEHOLDER_VALUES = new Set([
  'password',
  'passwd',
  'pass',
  'secret',
  'mypassword',
  'yourpassword',
  'apikey',
  'token',
  '123456',
  'password123',
]);

function looksLikePlaceholder(value: string): boolean {
  if (PLACEHOLDER_VALUES.has(value.toLowerCase())) return true;
  if (PLACEHOLDER.test(value)) return true;
  // `AKIAXXXXXXXXXXXXXXXX`, `sk-aaaaaaaa...` — a single repeated character is
  // documentation, not a credential.
  if (/^(.)\1{7,}$/.test(value)) return true;
  if (/YOUR|HERE|REPLACE|INSERT/i.test(value)) return true;
  return false;
}

/**
 * Shannon entropy in bits per character.
 *
 * Real keys are high-entropy; English words and identifiers are not. Used to
 * keep generic "long random-looking string" rules from firing on ordinary text.
 */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);

  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const MIN_ENTROPY_FOR_GENERIC = 3.5;

/**
 * Ordered rules. Specific, high-confidence patterns first so their findings
 * describe the actual provider rather than "high-entropy string".
 */
const RULES: readonly SecretRule[] = [
  {
    name: 'aws_access_key',
    description: 'AWS access key id',
    severity: 'block',
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    confirm: (m) => !looksLikePlaceholder(m.slice(4)),
  },
  {
    name: 'aws_secret_key',
    description: 'AWS secret access key',
    severity: 'block',
    re: /\baws_secret_access_key\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
  },
  {
    name: 'github_token',
    description: 'GitHub token',
    severity: 'block',
    re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    name: 'openai_key',
    description: 'OpenAI-style API key',
    severity: 'block',
    re: /\bsk-(?:proj-|ant-|live-)?[A-Za-z0-9_-]{16,}\b/g,
    confirm: (m) => !looksLikePlaceholder(m.slice(3)),
  },
  {
    name: 'anthropic_key',
    description: 'Anthropic API key',
    severity: 'block',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'google_api_key',
    description: 'Google API key',
    severity: 'block',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: 'slack_token',
    description: 'Slack token',
    severity: 'block',
    re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: 'stripe_key',
    description: 'Stripe secret key',
    severity: 'block',
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    name: 'private_key',
    description: 'Private key block',
    severity: 'block',
    re: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY-----/g,
  },
  {
    name: 'jwt',
    description: 'JSON Web Token',
    severity: 'block',
    // Three base64url segments. The header segment almost always starts `eyJ`.
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    name: 'connection_string',
    description: 'Database connection string with credentials',
    severity: 'block',
    // A password inside a URL. `user:pass@host` is the dangerous shape.
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@'"]{3,})@[^\s/'"]+/gi,
    confirm: (m) => {
      const password = /:\/\/[^\s:/@]+:([^\s@'"]{3,})@/.exec(m)?.[1] ?? '';
      return !looksLikePlaceholder(password);
    },
  },
  {
    name: 'bearer_token',
    description: 'Authorization header with a token',
    severity: 'block',
    re: /\b(?:authorization|auth)\s*[=:]\s*['"]?(?:bearer|token)\s+([A-Za-z0-9._~+/=-]{16,})/gi,
  },
  {
    name: 'assigned_secret',
    description: 'Variable named like a secret with a value assigned',
    severity: 'block',
    re: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[=:]\s*['"]([^'"\s]{8,})['"]/gi,
    confirm: (m) => {
      const value = /['"]([^'"\s]{8,})['"]/.exec(m)?.[1] ?? '';
      if (looksLikePlaceholder(value)) return false;
      // `password: "process.env.DB_PASSWORD"` is a reference, not a secret.
      if (/^(?:process\.env|import\.meta|os\.environ|System\.getenv)/.test(value)) return false;
      return true;
    },
  },
  {
    name: 'home_directory',
    description: 'Absolute path containing a user account name',
    severity: 'redact',
    re: /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)([A-Za-z0-9._-]+)/g,
    confirm: (m) => {
      const user = /(?:Users\\|Users\/|home\/)([A-Za-z0-9._-]+)/.exec(m)?.[1] ?? '';
      // Service and placeholder accounts are not a person.
      return !/^(?:root|admin|user|username|runner|node|app|docker|ubuntu|ec2-user|vagrant|test)$/i.test(user);
    },
  },
];

/**
 * Generic high-entropy detector, run after the specific rules.
 *
 * Catches credentials from providers we have no pattern for. Entropy-gated so
 * it does not fire on hashes in stack traces or long identifiers, and only
 * `redact` severity because on its own it cannot tell a key from a checksum.
 */
const GENERIC_SECRET = /\b[A-Za-z0-9_\-+/=]{32,}\b/g;

export interface ScanResult {
  readonly findings: readonly SecretFinding[];
  /** True when anything at `block` severity was found. */
  readonly blocked: boolean;
}

/** Four characters of context, never the credential itself. */
function previewOf(text: string, index: number, length: number): string {
  const head = text.slice(Math.max(0, index - 12), index).replace(/\s+/g, ' ');
  return `${head}[${length} chars redacted]`;
}

export function scanForSecrets(text: string): ScanResult {
  const findings: SecretFinding[] = [];
  const claimed: Array<[number, number]> = [];

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.re)) {
      const value = match[0];
      if (rule.confirm && !rule.confirm(value)) continue;

      const index = match.index ?? 0;
      claimed.push([index, index + value.length]);
      findings.push({
        rule: rule.name,
        description: rule.description,
        severity: rule.severity,
        index,
        preview: previewOf(text, index, value.length),
      });
    }
  }

  // Generic pass, skipping anything a specific rule already claimed so one
  // credential is not reported twice.
  for (const match of text.matchAll(GENERIC_SECRET)) {
    const value = match[0];
    const index = match.index ?? 0;

    // Overlap, not containment. The generic pattern includes `_` and `=`, so it
    // happily swallows `AWS_ACCESS_KEY_ID=AKIA…` as a single token that *starts
    // before* the specific match — a containment check would let that through
    // and report the same credential twice, under the vaguer rule.
    if (claimed.some(([start, end]) => index < end && index + value.length > start)) continue;
    if (shannonEntropy(value) < MIN_ENTROPY_FOR_GENERIC) continue;
    if (looksLikePlaceholder(value)) continue;
    // Hex-only strings of this length are hashes — content digests, git SHAs,
    // signatures — which are not secrets and are common in error output.
    if (/^[0-9a-f]+$/i.test(value)) continue;

    findings.push({
      rule: 'high_entropy_string',
      description: 'High-entropy string that may be a credential',
      severity: 'redact',
      index,
      preview: previewOf(text, index, value.length),
    });
  }

  findings.sort((a, b) => a.index - b.index);

  return {
    findings,
    blocked: findings.some((f) => f.severity === 'block'),
  };
}

/**
 * Replaces every finding with a marker.
 *
 * Used for `redact`-severity findings, where the submission is still worth
 * keeping. `block`-severity findings are never redacted and stored — the
 * submission is refused, because silently publishing a post whose credential we
 * quietly removed teaches the author nothing and leaves the key live.
 */
export function redactSecrets(text: string): string {
  const { findings } = scanForSecrets(text);
  if (findings.length === 0) return text;

  let result = text;
  // Apply back to front so earlier offsets stay valid.
  for (const finding of [...findings].sort((a, b) => b.index - a.index)) {
    const rule = RULES.find((r) => r.name === finding.rule);
    const re = rule ? new RegExp(rule.re.source, rule.re.flags.replace('g', '')) : GENERIC_SECRET;
    const match = re.exec(result.slice(finding.index));
    if (!match) continue;

    const length = match[0].length;
    result =
      result.slice(0, finding.index) +
      `<redacted:${finding.rule}>` +
      result.slice(finding.index + length);
  }

  return result;
}
