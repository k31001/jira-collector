#!/usr/bin/env bash
# jira-collector — Ubuntu / Debian update script
#
# Pulls the latest commit from origin/<branch>, installs deps, runs DB
# migrations, builds the Next.js bundle, restarts the service, and waits
# for the app to come back up. Auto-detects the run mode:
#
#   1. docker-compose.yml present                → docker compose up -d --build
#   2. pm2 command available                     → pm2 restart jira-collector
#   3. systemd unit "jira-collector.service" up  → sudo systemctl restart …
#   4. nothing detected                          → print start hint and exit 1
#
# Usage (from the repo root, or anywhere if JIRA_COLLECTOR_DIR is set):
#   ./scripts/update.sh                  # update main
#   ./scripts/update.sh staging          # positional branch argument
#   FORCE_UPDATE=1 ./scripts/update.sh   # ignore dirty tree
#
# Environment overrides:
#   JIRA_COLLECTOR_DIR        repo root (defaults to script's parent dir)
#   JIRA_COLLECTOR_BRANCH     branch to track (default: main)
#   JIRA_COLLECTOR_PORT       health check port (default: 3000)
#   JIRA_COLLECTOR_SERVICE    systemd unit name (default: jira-collector)
#   FORCE_UPDATE=1            proceed even with uncommitted local changes

set -euo pipefail

REPO_DIR="${JIRA_COLLECTOR_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}"
BRANCH="${1:-${JIRA_COLLECTOR_BRANCH:-main}}"
PORT="${JIRA_COLLECTOR_PORT:-3000}"
SERVICE="${JIRA_COLLECTOR_SERVICE:-jira-collector}"

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

step "Updating jira-collector at $REPO_DIR on branch $BRANCH"
if [ ! -d "$REPO_DIR/.git" ]; then
    fail "$REPO_DIR is not a git repository"
    exit 1
fi
cd "$REPO_DIR"

# --- Sanity: clean working tree ---
if [ -n "$(git status --porcelain)" ]; then
    warn "Uncommitted changes detected:"
    git status --short >&2
    if [ "${FORCE_UPDATE:-0}" != "1" ]; then
        fail "Refusing to update with uncommitted changes. Set FORCE_UPDATE=1 to override."
        exit 1
    fi
    warn "FORCE_UPDATE=1 set — proceeding and discarding local changes"
fi

# --- Pull ---
step "git fetch + reset to origin/$BRANCH"
git fetch origin "$BRANCH"
PREV_SHA=$(git rev-parse HEAD)
git reset --hard "origin/$BRANCH"
NEW_SHA=$(git rev-parse HEAD)

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
    ok "Already up to date ($NEW_SHA)"
    exit 0
fi
info "$PREV_SHA -> $NEW_SHA"

# --- Restart strategy detection ---
USE_DOCKER=0
USE_PM2=0
USE_SYSTEMD=0
if [ -f docker-compose.yml ]; then
    USE_DOCKER=1
elif command -v pm2 >/dev/null 2>&1; then
    USE_PM2=1
elif systemctl list-unit-files "${SERVICE}.service" >/dev/null 2>&1 \
    && systemctl cat "${SERVICE}.service" >/dev/null 2>&1; then
    USE_SYSTEMD=1
fi

# Docker rebuild handles npm ci / migrate / build inside the image, so we
# skip them on the host for that mode.
if [ "$USE_DOCKER" = "0" ]; then
    step "npm ci"
    npm ci

    step "npm run db:migrate"
    npm run db:migrate

    step "npm run build"
    npm run build
fi

# --- Restart ---
if [ "$USE_DOCKER" = "1" ]; then
    step "docker compose up -d --build"
    docker compose up -d --build
elif [ "$USE_PM2" = "1" ]; then
    step "pm2 restart jira-collector"
    pm2 restart jira-collector --update-env
elif [ "$USE_SYSTEMD" = "1" ]; then
    step "sudo systemctl restart ${SERVICE}.service"
    sudo systemctl restart "${SERVICE}.service"
else
    warn "No service manager detected (no docker-compose.yml, no pm2, no systemd unit '${SERVICE}.service')."
    warn "Build is up to date, but you need to restart the app yourself."
    warn "  npm start                                 # foreground (PORT=${PORT})"
    warn "  pm2 start npm --name jira-collector -- start"
    exit 1
fi

# --- Health check ---
step "Waiting for app on http://localhost:${PORT} ..."
deadline=$(( $(date +%s) + 90 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
    code=$(curl -s -o /dev/null --max-time 2 -w "%{http_code}" "http://localhost:${PORT}" 2>/dev/null || echo "000")
    case "$code" in
        2*|3*|4*)
            ok "Updated $PREV_SHA -> $NEW_SHA and confirmed live on :${PORT}"
            exit 0
            ;;
    esac
    sleep 1
done

fail "App did not respond on port ${PORT} within 90s"
exit 1
