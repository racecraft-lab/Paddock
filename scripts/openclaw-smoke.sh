#!/usr/bin/env bash

set -euo pipefail

if ! command -v openclaw >/dev/null 2>&1; then
  echo "[openclaw-smoke] openclaw CLI not found in PATH; skipping health checks"
  exit 0
fi

OPENCLAW_PLUGIN_ID="${OPENCLAW_SMOKE_PLUGIN_ID:-}"

if ! openclaw status --deep; then
  echo "[openclaw-smoke] openclaw status --deep failed"
  exit 1
fi

if [[ -n "$OPENCLAW_PLUGIN_ID" ]]; then
  if ! openclaw plugins inspect "$OPENCLAW_PLUGIN_ID" --runtime --json; then
    echo "[openclaw-smoke] openclaw plugins inspect failed for $OPENCLAW_PLUGIN_ID"
    exit 1
  fi
else
  echo "[openclaw-smoke] OPENCLAW_SMOKE_PLUGIN_ID not set; skipping plugin inspect ping"
fi

if ! openclaw doctor; then
  echo "[openclaw-smoke] openclaw doctor failed"
  exit 1
fi

echo "[openclaw-smoke] OpenClaw smoke checks completed"
