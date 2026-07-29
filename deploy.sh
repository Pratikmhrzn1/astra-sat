#!/usr/bin/env bash
set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*"; }

START=$(date +%s)

log "=== SAT Deploy Started ==="

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
git pull
log "Commit: $(git log -1 --oneline)"

# ── Build containers ──────────────────────────────────────────────────────────
log "Building containers..."
docker compose build

# ── Restart containers ────────────────────────────────────────────────────────
log "Starting containers..."
docker compose up -d

# ── Clean up source (Docker images are self-contained after build) ────────────
log "Removing source directories..."
rm -rf backend frontend

# ── Remove dangling images left over from previous builds ─────────────────────
log "Pruning unused Docker images..."
docker image prune -f

# ── Summary ───────────────────────────────────────────────────────────────────
END=$(date +%s)
log "=== Deploy complete in $((END - START))s ==="
echo
docker compose ps
