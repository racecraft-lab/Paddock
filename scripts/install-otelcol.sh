#!/usr/bin/env bash
# SPEC-008 — Cosign-verified OpenTelemetry Collector installer (T112).
#
# Per FR-090b (verified collector install).
#
# Installs `otelcol-contrib` v0.108.0 from the official release channel
# under `~/.local/bin/otelcol-contrib`. Verification ladder:
#   1) cosign present  → cosign-verified bundle (preferred)
#   2) cosign missing  → SHA256SUMS checksum verification (fallback)
#   3) Both fail       → exit 1, INSERT a `governance_health_events`
#                        row with state='install_failed' and detail.
#
# Audit: every run appends one `governance_health_events` row via the
# `sqlite3` CLI, regardless of outcome:
#   - state='install_succeeded'  with metric_json={version, verification, sha256}
#   - state='install_failed'     with metric_json={detail}
#
# DB path is resolved from `MISSION_CONTROL_DATA_DIR/mission-control.db`
# (default `.data/mission-control.db`).
#
# This is a deploy-host script. Not test-runnable in CI. Run on a real
# host with internet access to the upstream OTel collector release page.
#
# @see specs/008-resource-governance/spec.md FR-090b
# @see specs/008-resource-governance/tasks.md T112

set -euo pipefail

OTELCOL_VERSION="0.108.0"
OTELCOL_BIN_DIR="${HOME}/.local/bin"
OTELCOL_BIN_PATH="${OTELCOL_BIN_DIR}/otelcol-contrib"
RELEASE_BASE="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTELCOL_VERSION}"

DATA_DIR="${MISSION_CONTROL_DATA_DIR:-.data}"
DB_PATH="${DATA_DIR}/mission-control.db"

UNAME_S="$(uname -s | tr '[:upper:]' '[:lower:]')"
UNAME_M="$(uname -m)"
case "${UNAME_M}" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "ERROR: unsupported arch ${UNAME_M}" >&2; exit 1 ;;
esac
case "${UNAME_S}" in
  linux) PLATFORM="linux" ;;
  darwin) PLATFORM="darwin" ;;
  *) echo "ERROR: unsupported OS ${UNAME_S}" >&2; exit 1 ;;
esac

ARTIFACT="otelcol-contrib_${OTELCOL_VERSION}_${PLATFORM}_${ARCH}.tar.gz"
ARTIFACT_URL="${RELEASE_BASE}/${ARTIFACT}"
CHECKSUMS_URL="${RELEASE_BASE}/SHA256SUMS"

TMP_DIR="$(mktemp -d -t otelcol-install-XXXXXX)"
trap 'rm -rf "${TMP_DIR}"' EXIT

# Helper — append a governance_health_events row.
audit_event() {
  local state="$1"
  local metric_json="$2"
  if [[ ! -f "${DB_PATH}" ]]; then
    echo "WARN: DB ${DB_PATH} not found; skipping audit row" >&2
    return 0
  fi
  # shellcheck disable=SC2016
  sqlite3 "${DB_PATH}" "INSERT INTO governance_health_events (component, state, metric_json) VALUES ('otelcol_install', '${state}', '${metric_json}')"
}

fail() {
  local detail="$1"
  audit_event "install_failed" "{\"detail\":\"${detail//\"/\\\"}\",\"version\":\"${OTELCOL_VERSION}\"}"
  echo "ERROR: ${detail}" >&2
  exit 1
}

echo "Downloading ${ARTIFACT_URL}..."
curl -fsSL --output "${TMP_DIR}/${ARTIFACT}" "${ARTIFACT_URL}" \
  || fail "failed to download ${ARTIFACT_URL}"

echo "Downloading SHA256SUMS..."
curl -fsSL --output "${TMP_DIR}/SHA256SUMS" "${CHECKSUMS_URL}" \
  || fail "failed to download checksums"

VERIFICATION="unknown"
if command -v cosign >/dev/null 2>&1; then
  echo "Verifying with cosign..."
  curl -fsSL --output "${TMP_DIR}/SHA256SUMS.sig" "${CHECKSUMS_URL}.sig" \
    || fail "failed to download cosign signature"
  curl -fsSL --output "${TMP_DIR}/SHA256SUMS.pem" "${CHECKSUMS_URL}.pem" \
    || fail "failed to download cosign certificate"
  cosign verify-blob \
    --certificate-identity-regexp 'https://github.com/open-telemetry/opentelemetry-collector-releases/.+' \
    --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
    --signature "${TMP_DIR}/SHA256SUMS.sig" \
    --certificate "${TMP_DIR}/SHA256SUMS.pem" \
    "${TMP_DIR}/SHA256SUMS" \
    || fail "cosign verification failed"
  VERIFICATION="cosign"
else
  echo "WARN: cosign not installed; falling back to SHA256SUMS checksum verification" >&2
  VERIFICATION="checksum"
fi

# Confirm the artifact's hash is in SHA256SUMS.
EXPECTED_LINE="$(grep -E " ${ARTIFACT}\$" "${TMP_DIR}/SHA256SUMS" || true)"
if [[ -z "${EXPECTED_LINE}" ]]; then
  fail "no checksum entry for ${ARTIFACT}"
fi
EXPECTED_HASH="$(echo "${EXPECTED_LINE}" | awk '{print $1}')"
ACTUAL_HASH="$(shasum -a 256 "${TMP_DIR}/${ARTIFACT}" | awk '{print $1}')"
if [[ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]]; then
  fail "checksum mismatch: expected ${EXPECTED_HASH}, got ${ACTUAL_HASH}"
fi

echo "Extracting..."
tar -xzf "${TMP_DIR}/${ARTIFACT}" -C "${TMP_DIR}" \
  || fail "failed to extract archive"

mkdir -p "${OTELCOL_BIN_DIR}"
install -m 0755 "${TMP_DIR}/otelcol-contrib" "${OTELCOL_BIN_PATH}" \
  || fail "failed to install ${OTELCOL_BIN_PATH}"

echo "Installed ${OTELCOL_BIN_PATH} (${VERIFICATION}, sha256=${EXPECTED_HASH})"
audit_event "install_succeeded" "{\"version\":\"${OTELCOL_VERSION}\",\"verification\":\"${VERIFICATION}\",\"sha256\":\"${EXPECTED_HASH}\"}"
exit 0
