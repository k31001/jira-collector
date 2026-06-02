# jira-collector — Windows PowerShell update script (non-Docker)
#
# Pulls the latest commit from origin/<branch>, installs deps, runs DB
# migrations, builds the Next.js bundle, restarts the service, and waits
# for the app to come back up. Restart strategy is auto-detected:
#
#   1. pm2 command available           → pm2 restart jira-collector
#   2. Windows service "jira-collector" → Restart-Service jira-collector
#   3. nothing detected                 → start in background (npm start)
#
# Usage (from the repo root, or anywhere if JIRA_COLLECTOR_DIR is set):
#   .\scripts\update.ps1                       # update main
#   .\scripts\update.ps1 -Branch staging       # update a different branch
#   $env:FORCE_UPDATE = "1"; .\scripts\update.ps1   # ignore dirty tree
#
# Environment overrides:
#   JIRA_COLLECTOR_DIR     repo root (defaults to script's parent dir)
#   JIRA_COLLECTOR_BRANCH  branch to track (default: main)
#   JIRA_COLLECTOR_PORT    port for the post-restart health check (default: 3000)
#   JIRA_COLLECTOR_SERVICE Windows service name (default: jira-collector)
#   FORCE_UPDATE=1         proceed even with uncommitted local changes

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
$ServiceName = if ($env:JIRA_COLLECTOR_SERVICE) { $env:JIRA_COLLECTOR_SERVICE } else { "jira-collector" }

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host "[i] $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[X] $msg" -ForegroundColor Red }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }

Write-Step "Updating jira-collector at $RepoDir on branch $Branch"
if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
    Write-Fail "$RepoDir is not a git repository"
    exit 1
}
Set-Location $RepoDir

# --- Sanity: clean working tree ---
$dirty = git status --porcelain
if ($dirty) {
    Write-Warn "Uncommitted changes detected:"
    git status --short
    if ($env:FORCE_UPDATE -ne "1") {
        Write-Fail "Refusing to update with uncommitted changes. Set FORCE_UPDATE=1 to override."
        exit 1
    }
    Write-Warn "FORCE_UPDATE=1 set — proceeding and discarding local changes"
}

# --- Pull ---
Write-Step "git fetch + reset to origin/$Branch"
git fetch origin $Branch
$prevSha = (git rev-parse HEAD).Trim()
git reset --hard "origin/$Branch"
$newSha = (git rev-parse HEAD).Trim()

if ($prevSha -eq $newSha) {
    Write-Ok "Already up to date ($newSha)"
    exit 0
}
Write-Info "$prevSha -> $newSha"

# --- Build pipeline ---
Write-Step "npm ci"
npm ci
if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci failed"; exit 1 }

Write-Step "npm run db:migrate"
npm run db:migrate
if ($LASTEXITCODE -ne 0) { Write-Fail "db:migrate failed"; exit 1 }

Write-Step "npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "build failed"; exit 1 }

# --- Restart ---
$usePm2 = [bool](Get-Command "pm2" -ErrorAction SilentlyContinue)
$service = if (-not $usePm2) { Get-Service -Name $ServiceName -ErrorAction SilentlyContinue } else { $null }

if ($usePm2) {
    Write-Step "pm2 restart jira-collector"
    pm2 restart jira-collector --update-env
    if ($LASTEXITCODE -ne 0) { Write-Fail "pm2 restart failed"; exit 1 }
} elseif ($service) {
    Write-Step "Restart-Service $ServiceName"
    Restart-Service -Name $ServiceName
} else {
    Write-Warn "No service manager detected (no pm2, no service '$ServiceName')."
    Write-Step "Starting the app in the background (npm start, PORT=$Port)"
    # Free the port from an instance a previous run of this fallback started,
    # so the fresh build takes over instead of colliding with a stale process.
    try {
        $conns = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($procId in $procIds) {
                Write-Info "Stopping existing listener on :$Port (pid: $procId)"
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
        }
    } catch {
        Write-Warn "Could not check/stop an existing listener on :$Port. Free it manually if start fails."
    }
    $logOut = Join-Path $RepoDir "app.log"
    $logErr = Join-Path $RepoDir "app.err.log"
    Write-Info "Logs -> $logOut (stderr: $logErr)"
    $env:PORT = $Port
    Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $RepoDir `
        -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden
    Write-Info "Tip: for an auto-restarting managed service, install pm2 or register a Windows service with NSSM."
}

# --- Health check ---
Write-Step "Waiting for app on http://localhost:$Port ..."
$deadline = (Get-Date).AddSeconds(90)
$ok = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
            $ok = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $ok) {
    Write-Fail "App did not respond on port $Port within 90s"
    exit 1
}

Write-Ok "Updated $prevSha -> $newSha and confirmed live on :$Port"
