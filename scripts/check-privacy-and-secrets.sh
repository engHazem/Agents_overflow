#!/usr/bin/env bash
# ==============================================================================
# Pre-Commit / Pre-Push Privacy & Secrets Scanner
# ==============================================================================
# Prevents accidental commits of credentials, API keys, and personal information.
#
# Usage:
#   ./scripts/check-privacy-and-secrets.sh [--staged | --all]
# ==============================================================================

set -eo pipefail

MODE="${1:---staged}"
EXIT_CODE=0

echo "🔍 Running Privacy & Secrets Scanner ($MODE)..."

# Determine files to scan
if [ "$MODE" = "--all" ]; then
    FILES=$(git ls-files)
else
    FILES=$(git diff --cached --name-only --diff-filter=ACM)
fi

if [ -z "$FILES" ]; then
    echo "✅ No files to scan."
    exit 0
fi

# Sensitive patterns (regex)
PATTERNS=(
    "(sk-ant-api[a-zA-Z0-9_\-]{20,})"                 # Anthropic API keys
    "(sk-[a-zA-Z0-9]{20,})"                          # OpenAI API keys
    "(ghp_[a-zA-Z0-9]{36})"                          # GitHub Personal Access Tokens
    "(gho_[a-zA-Z0-9]{36})"                          # GitHub OAuth Tokens
    "(glpat-[a-zA-Z0-9_\-]{20,})"                    # GitLab Personal Access Tokens
    "(xox[baprs]-[0-9]{10,}-[a-zA-Z0-9]{20,})"       # Slack Tokens
    "(AKIA[0-9A-Z]{16})"                             # AWS Access Key ID
    "-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----" # Private keys
    "(/Users/[a-zA-Z0-9_\.\-]+/)"                    # Absolute macOS personal user paths
    "([a-zA-Z0-9_.+-]+@(gmail|yahoo|hotmail|outlook)\.com)" # Personal emails (allow example.com)
)

for file in $FILES; do
    # Skip checking .env.example, scripts themselves, or binary files
    if [[ "$file" == ".env.example" || "$file" == "scripts/check-privacy-and-secrets.sh" ]]; then
        continue
    fi

    if [ -f "$file" ]; then
        for pattern in "${PATTERNS[@]}"; do
            MATCHES=$(grep -E -n "$pattern" "$file" 2>/dev/null || true)
            if [ -n "$MATCHES" ]; then
                echo "❌ [SECURITY ALERT] Sensitive data pattern detected in $file:"
                echo "$MATCHES" | head -n 5
                EXIT_CODE=1
            fi
        done
    fi
done

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Privacy & Security Scan Passed! No credentials or personal data detected."
else
    echo ""
    echo "⚠️  Commit aborted: Please replace sensitive data with environment variables or safe placeholders."
fi

exit $EXIT_CODE
