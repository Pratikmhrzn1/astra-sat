#!/usr/bin/env bash
#
# Production deployment script — run on the VPS to pull and deploy the
# latest code. Services (see docker-compose.yml): backend, frontend, db.
#
# backend/.env and frontend/.env are gitignored (they hold secrets/config) but
# the deploy step at the end deletes the backend/ and frontend/ source
# directories entirely (images are self-contained after build) — so those
# files can't just live inside them. They're mirrored to BACKUP_DIR (outside
# the repo, so `rm -rf` never touches it) and restored into place before every
# build.
#
# backend/.env is REQUIRED — docker-compose.yml's backend service reads it via
# `env_file`, so the build/up step hard-fails without it.
# frontend/.env is OPTIONAL — not referenced by docker-compose.yml; only
# matters locally for `npm run dev`. Restored opportunistically if a backup
# exists, but its absence never blocks a deploy.
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

TOTAL_START=$(date +%s)
BACKUP_DIR="$HOME/.sat-deploy-backup"
REQUIRED_FILES=(backend/.env)
OPTIONAL_FILES=(frontend/.env)

log() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

phase_start() {
    PHASE_START=$(date +%s)
    log "▶ $1"
}

phase_end() {
    local elapsed=$(( $(date +%s) - PHASE_START ))
    log "✔ done in ${elapsed}s"
}

# Copies one file to/from BACKUP_DIR, preserving its relative path.
# mode: "backup" (repo → BACKUP_DIR) or "restore" (BACKUP_DIR → repo)
# required: "true" → missing file + missing backup is a fatal error;
#           "false" → missing file + missing backup is silently skipped.
sync_file() {
    local f="$1" mode="$2" required="$3"
    local backup_path="$BACKUP_DIR/$f"
    if [[ "$mode" == "backup" ]]; then
        if [[ -f "$f" ]]; then
            mkdir -p "$(dirname "$backup_path")"
            cp "$f" "$backup_path"
            log "  backed up $f"
        fi
    else
        if [[ ! -f "$f" ]]; then
            if [[ -f "$backup_path" ]]; then
                mkdir -p "$(dirname "$f")"
                cp "$backup_path" "$f"
                log "  restored $f from backup"
            elif [[ "$required" == "true" ]]; then
                log "  ERROR: $f is missing and no backup exists at $backup_path"
                log "  Create it manually before deploying (see ${f}.example)."
                exit 1
            else
                log "  $f not present (optional — skipping)"
            fi
        fi
    fi
}

sync_all() {
    local mode="$1"
    for f in "${REQUIRED_FILES[@]}"; do sync_file "$f" "$mode" true; done
    for f in "${OPTIONAL_FILES[@]}"; do sync_file "$f" "$mode" false; done
}

# 1. Pull latest code
#
# `git pull` alone is NOT enough here: backend/ and frontend/ were deleted
# from disk (step 6 of the previous run) without telling git (no `git rm`),
# so git still considers them tracked-but-missing. `git reset --hard origin/main`
# deterministically recreates every tracked file from the latest remote commit,
# regardless of whether there's anything new to pull.
phase_start "Pulling latest code from git"
git fetch origin
git reset --hard origin/main
log "Deployed commit: $(git log -1 --format='%h %s')"
phase_end

# 2. Restore critical files (.env) in case a previous run's cleanup removed them
phase_start "Restoring critical files from backup"
mkdir -p "$BACKUP_DIR"
sync_all restore
phase_end

# 3. Refresh the backup with whatever is on disk now (picks up any manual
#    server-side edits to .env made since the last deploy)
phase_start "Refreshing backup of critical files"
sync_all backup
phase_end

# 4. Build images
phase_start "Building Docker containers"
docker compose build
phase_end

# 5. Start/restart containers
phase_start "Starting/restarting containers"
docker compose up -d
phase_end

# 6. Clean up source (images are self-contained after build) — critical files
#    were already mirrored to BACKUP_DIR in step 3, so it's safe to remove them.
phase_start "Deleting backend and frontend source directories"
rm -rf backend frontend
phase_end

# 7. Put critical files back immediately — NOT just for the next deploy run.
#    Every `docker compose` invocation (restart, ps, logs, ...) re-reads
#    docker-compose.yml's `env_file: ./backend/.env` from disk at the moment
#    it's called, regardless of subcommand. If backend/.env doesn't exist
#    between deploys, routine commands like `docker compose restart backend`
#    break even though the containers themselves are running fine.
phase_start "Restoring critical files after cleanup"
sync_all restore
phase_end

# 8. Prune dangling images
phase_start "Pruning dangling Docker images"
docker image prune -f
phase_end

# 9. Summary
phase_start "Container status"
docker compose ps
phase_end

TOTAL_ELAPSED=$(( $(date +%s) - TOTAL_START ))
log "Deployment complete in ${TOTAL_ELAPSED}s"
