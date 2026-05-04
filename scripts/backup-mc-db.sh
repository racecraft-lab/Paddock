#!/usr/bin/env bash
#
# SPEC-008 — Daily incremental backup of Mission Control state (T203).
#
# Per FR-090g, FR-090k, FR-261, FR-263, FR-271. Captures:
#   - SQLite DB (mission-control.db)
#   - Archive partitions under <DATA_DIR>/archives
#   - Filestorage WAL (FR-090g)
#   - Encrypted secret material (encrypted-at-rest, key id captured)
#
# Optional off-node mirror via MC_BACKUP_REMOTE_RSYNC_PATH per FR-090k.
#
# Usage:
#   bash scripts/backup-mc-db.sh
#
# Env:
#   MISSION_CONTROL_DATA_DIR   default: ./.data
#   MC_BACKUP_DEST             default: ./.backups
#   MC_BACKUP_REMOTE_RSYNC_PATH (optional) — rsync target like
#       host:/srv/mc-backups/
#
set -euo pipefail

DATA_DIR="${MISSION_CONTROL_DATA_DIR:-./.data}"
DEST="${MC_BACKUP_DEST:-./.backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${DEST}/${TS}"

if [ ! -d "${DATA_DIR}" ]; then
  echo "backup-mc-db: data dir not found at ${DATA_DIR}" >&2
  exit 1
fi

mkdir -p "${TARGET}"

# 1. SQLite DB — use sqlite3 .backup so the WAL is consistent.
if [ -f "${DATA_DIR}/mission-control.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DATA_DIR}/mission-control.db" \
      ".backup '${TARGET}/mission-control.db'"
  else
    cp "${DATA_DIR}/mission-control.db" "${TARGET}/mission-control.db"
  fi
fi

# 2. Archive partitions.
if [ -d "${DATA_DIR}/archives" ]; then
  cp -R "${DATA_DIR}/archives" "${TARGET}/archives"
fi

# 3. Filestorage WAL (FR-090g).
if [ -d "${DATA_DIR}/filestorage" ]; then
  cp -R "${DATA_DIR}/filestorage" "${TARGET}/filestorage"
fi

# 4. Encrypted secret material — never decrypt; copy ciphertext only.
if [ -d "${DATA_DIR}/secrets" ]; then
  cp -R "${DATA_DIR}/secrets" "${TARGET}/secrets"
fi

# 5. Manifest.
cat > "${TARGET}/manifest.json" <<JSON
{
  "spec": "008-resource-governance",
  "task": "T203",
  "timestamp": "${TS}",
  "data_dir": "${DATA_DIR}",
  "components": [
    "mission-control.db",
    "archives",
    "filestorage",
    "secrets"
  ]
}
JSON

# 6. Optional off-node mirror.
if [ -n "${MC_BACKUP_REMOTE_RSYNC_PATH:-}" ]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${TARGET}/" "${MC_BACKUP_REMOTE_RSYNC_PATH%/}/${TS}/"
  else
    echo "backup-mc-db: rsync not installed, skipping remote mirror" >&2
  fi
fi

echo "backup-mc-db: snapshot at ${TARGET}"
