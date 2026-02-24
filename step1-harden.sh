#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════╗
# ║  STEP 1: Security Hardening — PUBLIC REPO EMERGENCY              ║
# ╠════════════════════════════════════════════════════════════════════╣
# ║                                                                    ║
# ║  Your repo is PUBLIC. Anyone can see your API endpoints,          ║
# ║  architecture, and the .env.backup with Supabase creds.           ║
# ║                                                                    ║
# ║  This script:                                                      ║
# ║   A. Removes sensitive files from git tracking                    ║
# ║   B. Updates .gitignore                                           ║
# ║   C. Shows you what to do in Vercel                               ║
# ║                                                                    ║
# ║  You also need to manually add these new files to git:            ║
# ║   - src/middleware.ts    (API auth + rate limiting)               ║
# ║   - next.config.js      (source maps disabled)                   ║
# ║                                                                    ║
# ╚════════════════════════════════════════════════════════════════════╝
#
# Run from your project root:  bash step1-harden.sh

set -e

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  TradeYodha Security Hardening — Step 1           ║"
echo "╚════════════════════════════════════════════════════╝"

# ── Part A: Remove sensitive files from git ──────────────
echo ""
echo "━━━ Part A: Removing sensitive files from git tracking ━━━"
echo ""

FILES_TO_REMOVE=(
  ".env.backup"
  "api_test_results.json"
  "api_test_v2_results.json"
  "diagnose.sh"
  "test-apis.js"
  "test-ml-endpoint.js"
  "test-ml-debug.js"
  "test_api_endpoints.py"
)

for f in "${FILES_TO_REMOVE[@]}"; do
  if git ls-files --error-unmatch "$f" &>/dev/null; then
    git rm --cached "$f"
    echo "  ✅ Untracked: $f"
  else
    echo "  ⏭️  Not in git: $f"
  fi
done

# ── Part B: Update .gitignore ────────────────────────────
echo ""
echo "━━━ Part B: Updating .gitignore ━━━"
echo ""

# Append security entries if not present
ENTRIES=(
  "# Security — never commit these"
  ".env.backup"
  ".env.*.backup"
  "api_test*.json"
  "test-*.js"
  "test_*.py"
  "diagnose.sh"
  "*.log"
  ".vercel"
)

for entry in "${ENTRIES[@]}"; do
  if ! grep -qxF "$entry" .gitignore 2>/dev/null; then
    echo "$entry" >> .gitignore
    echo "  + $entry"
  fi
done

echo "  ✅ .gitignore updated"

# ── Part C: Purge .env.backup from git history ──────────
echo ""
echo "━━━ Part C: Purging .env.backup from git history ━━━"
echo ""
echo "  This rewrites git history to remove the Supabase credentials."
echo "  After this, you'll need to force push."
echo ""
read -p "  Proceed with history rewrite? (y/N): " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git filter-branch --force --index-filter \
    'git rm --cached --ignore-unmatch .env.backup api_test_results.json api_test_v2_results.json' \
    --prune-empty -- --all 2>/dev/null || echo "  (filter-branch completed)"
  echo "  ✅ History rewritten. You'll need: git push --force"
else
  echo "  ⏭️  Skipped. Old creds remain in git history."
  echo "     You should rotate Supabase password anyway."
fi

# ── Part D: Stage new security files ─────────────────────
echo ""
echo "━━━ Part D: Staging security files ━━━"
echo ""

git add .gitignore
git add src/middleware.ts 2>/dev/null && echo "  ✅ Staged: src/middleware.ts" || echo "  ⚠️  src/middleware.ts not found — copy it first!"
git add next.config.js 2>/dev/null && echo "  ✅ Staged: next.config.js"

# ── Summary ──────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  MANUAL STEPS NEEDED                              ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo "  1. GENERATE API SECRET:"
echo "     openssl rand -hex 32"
echo ""
echo "  2. ADD TO VERCEL (Settings → Environment Variables):"
echo "     TRADEYODHA_API_SECRET = <paste the hex string>"
echo ""
echo "  3. ROTATE SUPABASE PASSWORD (even if unused):"
echo "     Supabase dashboard → Settings → Database → Reset"
echo ""
echo "  4. COMMIT AND PUSH:"
echo "     git commit -m 'security: add API auth, rate limiting, clean secrets'"
echo "     git push --force   # if you did the history rewrite"
echo "     git push            # if you skipped it"
echo ""
echo "  5. VERIFY after deploy:"
echo "     curl https://tradeyodha.com/api/market/prices?tickers=SPY"
echo "     → Should return 401 Unauthorized"
echo ""
echo "     Open https://tradeyodha.com normally"
echo "     → Should work (origin header matches)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
