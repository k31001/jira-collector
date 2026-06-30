# jira-collector — pull-and-run launcher (Windows PowerShell, non-Docker)
#
# Pulls the latest commit from origin/<branch> and runs the server in the
# foreground:
#
#   * Update available  -> fast-forward pull, npm ci, db:migrate, build, start
#   * Already up to date -> start only (with a first-run build fallback)
#
# The server runs in the FOREGROUND; press Ctrl+C to stop it. For an
# auto-restarting managed deployment (pm2 / Windows service) use update.ps1.
#
# Usage (from the repo root, or anywhere if JIRA_COLLECTOR_DIR is set):
#   .\scripts\run.ps1                   # track main
#   .\scripts\run.ps1 -Branch staging   # track a different branch
#
# Environment overrides:
#   JIRA_COLLECTOR_DIR     repo root (defaults to the script's parent dir)
#   JIRA_COLLECTOR_BRANCH  branch to track (default: main)
#   JIRA_COLLECTOR_PORT    port to serve on (default: 3000)
#   SKIP_PULL=1            skip the git fetch/pull and just (build if needed +) start

param(
    [string]$Branch
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoDir = if ($env:JIRA_COLLECTOR_DIR) {
    $env:JIRA_COLLECTOR_DIR
} else {
    Split-Path -Parent $PSScriptRoot
}
if (-not $Branch) {
    $Branch = if ($env:JIRA_COLLECTOR_BRANCH) { $env:JIRA_COLLECTOR_BRANCH } else { "main" }
}
$Port = if ($env:JIRA_COLLECTOR_PORT) { $env:JIRA_COLLECTOR_PORT } else { "3000" }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host "[i] $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[X] $msg" -ForegroundColor Red }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }

if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
    Write-Fail "$RepoDir is not a git repository"
    exit 1
}
Set-Location $RepoDir

$updated = $false

if ($env:SKIP_PULL -eq "1") {
    Write-Info "SKIP_PULL=1 - skipping git fetch/pull"
} else {
    Write-Step "Checking origin/$Branch for updates"
    git fetch --quiet origin $Branch
    if ($LASTEXITCODE -ne 0) { Write-Fail "git fetch failed"; exit 1 }
    $behind = [int]((git rev-list --count "HEAD..origin/$Branch") | Out-String).Trim()
    if ($behind -gt 0) {
        $prev = (git rev-parse --short HEAD).Trim()
        Write-Step "Update available ($behind commit(s)) - fast-forwarding to origin/$Branch"
        git merge --ff-only "origin/$Branch"
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "$prev -> $((git rev-parse --short HEAD).Trim())"
            $updated = $true
        } else {
            Write-Warn "Fast-forward failed (local commits or a dirty tree). Starting the current version without updating."
            Write-Warn "Resolve manually, or use update.ps1 (FORCE_UPDATE=1) to hard-reset."
        }
    } else {
        Write-Ok "Already up to date ($((git rev-parse --short HEAD).Trim()))"
    }
}

if ($updated) {
    Write-Step "npm ci"
    npm ci
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci failed"; exit 1 }
    Write-Step "npm run db:migrate"
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { Write-Fail "db:migrate failed"; exit 1 }
    Write-Step "npm run build"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "build failed"; exit 1 }
} else {
    # First-run fallback so a clean checkout can still start without an update.
    if (-not (Test-Path (Join-Path $RepoDir "node_modules"))) {
        Write-Step "node_modules missing - npm ci"
        npm ci
        if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci failed"; exit 1 }
    }
    if (-not (Test-Path (Join-Path $RepoDir ".next"))) {
        Write-Step "No build found - db:migrate + build"
        npm run db:migrate
        if ($LASTEXITCODE -ne 0) { Write-Fail "db:migrate failed"; exit 1 }
        npm run build
        if ($LASTEXITCODE -ne 0) { Write-Fail "build failed"; exit 1 }
    }
}

Write-Step "Starting server on http://localhost:$Port (Ctrl+C to stop)"
$env:PORT = $Port
npm start
