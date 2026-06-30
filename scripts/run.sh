#!/usr/bin/env bash
# jira-collector — pull-and-run launcher (Linux / macOS, non-Docker)
#
# Pulls the latest commit from origin/<branch> and runs the server in the
# foreground:
#
#   * Update available  → fast-forward pull, npm ci, db:migrate, build, start
#   * Already up to date → start only (with a first-run build fallback)
#
# The server runs in the FOREGROUND; press Ctrl+C to stop it. For an
# auto-restarting managed deployment (pm2 / systemd) use scripts/update.sh.
#
# Usage (from the repo root, or anywhere if JIRA_COLLECTOR_DIR is set):
#   ./scripts/run.sh                 # track main
#   ./scripts/run.sh staging         # positional branch argument
#
# Environment overrides:
#   JIRA_COLLECTOR_DIR     repo root (defaults to the script's parent dir)
#   JIRA_COLLECTOR_BRANCH  branch to track (default: main)
#   JIRA_COLLECTOR_PORT    port to serve on (default: 3000)
#   SKIP_PULL=1            skip the git fetch/pull and just (build if needed +) start

set -euo pipefail

REPO_DIR="${JIRA_COLLECTOR_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}"
BRANCH="${1:-${JIRA_COLLECTOR_BRANCH:-main}}"
PORT="${JIRA_COLLECTOR_PORT:-3000}"

# --- pretty output ---
if [ -t 1 ]; then
    C_STEP=$'\033[1;36m'; C_INFO=$'\033[0;37m'; C_WARN=$'\033[1;33m'
    C_FAIL=$'\033[1;31m'; C_OK=$'\033[1;32m';   C_RST=$'\033[0m'
else
    C_STEP=""; C_INFO=""; C_WARN=""; C_FAIL=""; C_OK=""; C_RST=""
fi
step() { printf "%s==> %s%s\n" "$C_STEP" "$*" "$C_RST"; }
info() { printf "%s[i] %s%s\n"  "$C_INFO" "$*" "$C_RST"; }
warn() { printf "%s[!] %s%s\n"  "$C_WARN" "$*" "$C_RST" >&2; }
fail() { printf "%s[X] %s%s\n"  "$C_FAIL" "$*" "$C_RST" >&2; }
ok()   { printf "%s[OK] %s%s\n" "$C_OK"   "$*" "$C_RST"; }

if [ ! -d "$REPO_DIR/.git" ]; then
    fail "$REPO_DIR is not a git repository"
    exit 1
fi
cd "$REPO_DIR"

updated=0

if [ "${SKIP_PULL:-0}" = "1" ]; then
    info "SKIP_PULL=1 — skipping git fetch/pull"
else
    step "Checking origin/$BRANCH for updates"
    git fetch --quiet origin "$BRANCH"
    behind=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")
    if [ "$behind" -gt 0 ]; then
        prev=$(git rev-parse --short HEAD)
        step "Update available ($behind commit(s)) — fast-forwarding to origin/$BRANCH"
        if git merge --ff-only "origin/$BRANCH"; then
            ok "$prev -> $(git rev-parse --short HEAD)"
            updated=1
        else
            warn "Fast-forward failed (local commits or a dirty tree). Starting the current version without updating."
            warn "Resolve manually, or use scripts/update.sh (FORCE_UPDATE=1) to hard-reset."
        fi
    else
        ok "Already up to date ($(git rev-parse --short HEAD))"
    fi
fi

if [ "$updated" = "1" ]; then
    step "npm ci"
    npm ci
    step "npm run db:migrate"
    npm run db:migrate
    step "npm run build"
    npm run build
else
    # First-run fallback so a clean checkout can still start without an update.
    if [ ! -d node_modules ]; then
        step "node_modules missing — npm ci"
        npm ci
    fi
    if [ ! -d .next ]; then
        step "No build found — db:migrate + build"
        npm run db:migrate
        npm run build
    fi
fi

step "Starting server on http://localhost:${PORT} (Ctrl+C to stop)"
export PORT="$PORT"
exec npm start
