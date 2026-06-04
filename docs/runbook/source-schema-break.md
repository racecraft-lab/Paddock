# Runbook: Source Schema Break

> Status: SPEC-008 T213 (FR-264, FR-090d1, FR-090l)

---

## 1. Symptom

- Quarantine table accepts `reason='schema_broken'` rows.
- Activity feed: `governance_source_schema_broken`.
- Affected source's freshness pill turns red on the dashboard.

## 2. Impact

- Source-specific decisions stall until schema is realigned.
- Other sources continue normally (per-source quarantine).

## 3. Diagnose

1. Inspect `quarantined_raw_events` rows for the source_id.
2. Pull a recent payload sample and compare to the expected schema.
3. For Copilot sources, check the `#copilot-unknown-versions` anchor
   below.

## 4. Mitigate

- Pause the affected source's ingest path.
- Pin the consumer to the previous schema version where possible.

## 5. Recover

- Roll forward by promoting the new schema or rolling back the
  source emitter.
- Re-process quarantined events from the partition timestamp.

## 6. Validate

- No new `schema_broken` quarantine rows for 30 minutes.
- Source freshness pill returns green.

## 7. Postmortem

- File `docs/postmortems/<YYYY-MM-DD>-source-schema-break.md`.

## #copilot-unknown-versions

Per FR-090d1 — when Copilot emits a version we do not recognize:

1. Capture the unknown version string from the quarantined payload.
2. File an issue with the version + payload sample.
3. If the version is forward-compatible, add it to the allowlist
   in `COPILOT_SCHEMAS` /
   `LATEST_KNOWN_VERSION` inside
   `src/lib/observability/adapters/copilot-schema-versioning.ts`.
