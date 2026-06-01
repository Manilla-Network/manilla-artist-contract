#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# PUSH.sh  —  Push manilla-artist-contract/ subtree to GitHub
#
# Usage (from workspace root):
#   GITHUB_TOKEN=ghp_xxxx bash manilla-artist-contract/PUSH.sh
#
# The token needs: Contents → Read & Write on Manilla-Network/manilla-artist-contract
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_OWNER="Manilla-Network"
REPO_NAME="manilla-artist-contract"
BRANCH="main"
SUBTREE_PREFIX="manilla-artist-contract"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN is not set."
  echo "Run: GITHUB_TOKEN=ghp_xxxx bash manilla-artist-contract/PUSH.sh"
  exit 1
fi

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

# Configure git identity if not already set
git config user.email "deploy@manilla-collective.com" 2>/dev/null || true
git config user.name  "Manilla Deploy"              2>/dev/null || true

# Remove stale remote if it exists, then add fresh
git remote remove github-manilla 2>/dev/null || true
git remote add github-manilla "$REMOTE_URL"

echo "→ Pushing subtree manilla-artist-contract/ → github:${REPO_OWNER}/${REPO_NAME}@${BRANCH}"

git subtree push \
  --prefix="${SUBTREE_PREFIX}" \
  github-manilla \
  "${BRANCH}"

# Clean up — don't leave the token in git config
git remote remove github-manilla

echo ""
echo "✓ Push complete."
echo "  GitHub Actions CI will now build and deploy to Cloudflare Pages automatically."
echo "  Watch it at: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions"
