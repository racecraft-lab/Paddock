# Provider ToS Considerations — Observability Adapters

**Status**: SPEC-008 runtime ToS document (`CURRENT_RUNTIME_ACK_VERSION = 1`).
**Owner**: Paddock governance subsystem.
**Audience**: Operators evaluating which observability adapters they may
enable for their organisation, and the SPEC-008 ToS lifecycle gate at
`src/lib/provider-account-tos.ts`.
**Per**: FR-219x H2 structure (Surface / Default state / ToS notes /
Risk / Fallback / Acknowledgment).

This document is the canonical per-adapter ToS surface considered by
Paddock's `provider-account-tos` activation gate. Bumping
`CURRENT_RUNTIME_ACK_VERSION` requires every operator account to
re-acknowledge inside the 7-day grace window before the adapter can
continue ingesting data (FR-146 / FR-147).

The ordering and H2 slugs below match the basenames in
`src/lib/observability/adapters/*.ts`. The CI guard
`scripts/check-tos-doc.ts` (T123) fails if any adapter file is missing
a corresponding H2 here (orphan detection).

## claude-code-otel

- **Surface**: Anthropic Claude Code CLI emitting OpenTelemetry frames
  via `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Paddock receives OTLP
  HTTP and parses the metric stream into canonical_usage_events.
- **Default state**: `restricted` — operator must affirmatively
  acknowledge this surface because it captures CLI invocations
  initiated against an Anthropic-hosted model.
- **ToS notes**: Anthropic's commercial terms permit telemetry export
  for the operator's own usage. Paddock does NOT exfiltrate
  prompts or responses — only token-counter metrics and timing.
  Confirm your Anthropic agreement permits self-hosted
  observability before activation.
- **Risk**: Low. Token counters are additive metadata; no prompt body
  leaves the operator's process.
- **Fallback**: When unacknowledged, the adapter returns disabled and
  Claude Code usage falls back to `claude-code-transcript` (post-hoc
  transcript replay) under that surface's separate acknowledgement.
- **Acknowledgment**: Required at version 1. Re-prompt on every bump
  to `CURRENT_RUNTIME_ACK_VERSION`.

## claude-code-transcript

- **Surface**: Post-hoc parse of Claude Code transcript files written
  to `~/.claude/transcripts/*.jsonl`. Used when OTel emission is
  unavailable (e.g., MCP-server child process) per FR-071a.
- **Default state**: `restricted`.
- **ToS notes**: Transcript files are local artifacts written by the
  CLI to disk; reading them is not a network operation. Confirm your
  Anthropic agreement permits operator-side log scraping. Do NOT
  forward raw transcript content off-host without separate operator
  authorisation; Paddock extracts only token counters and
  invocation metadata.
- **Risk**: Medium. Transcripts contain prompt + response payloads;
  the adapter MUST redact body before persistence. Misconfiguration
  here can leak prompt content into canonical events.
- **Fallback**: When disabled, Claude Code surfaces no usage data
  unless `claude-code-otel` is concurrently active.
- **Acknowledgment**: Required at version 1.

## codex-stdout

- **Surface**: OpenAI Codex CLI `turn.completed.usage` events captured
  from process stdout when running interactively.
- **Default state**: `restricted`.
- **ToS notes**: Codex usage events are emitted by the operator's own
  CLI process. Confirm the OpenAI commercial agreement covers
  telemetry export. Stdout capture is in-process — no third-party
  hosting required.
- **Risk**: Low. Usage events carry token counters and request IDs;
  no completion text.
- **Fallback**: When disabled, prefer `codex-rollout` (file-resident
  audit trail). Stdout-only operators lose live usage signals; the
  governance evaluator deferrs admission with
  `defer:no_fallback` per FR-363 if neither surface is acknowledged.
- **Acknowledgment**: Required at version 1.

## codex-rollout

- **Surface**: Codex CLI `rollout-*.jsonl` files written to the
  per-session rollout directory. Provides duplicate-resilient parity
  with stdout per FR-082.
- **Default state**: `restricted`.
- **ToS notes**: Rollout files are local artifacts. Same OpenAI
  agreement applies as `codex-stdout`. No off-host transmission.
- **Risk**: Low. Same shape as codex-stdout.
- **Fallback**: When disabled, codex-stdout is the only Codex surface.
- **Acknowledgment**: Required at version 1.

## copilot-events-jsonl

- **Surface**: GitHub Copilot CLI `~/.copilot/events.jsonl` schema
  version `0.0.422` (FR-083 / FR-090d). CI/non-TTY mode required for
  emission.
- **Default state**: `restricted`.
- **ToS notes**: GitHub Copilot terms require explicit user opt-in to
  telemetry export. Confirm operator authority to observe Copilot
  invocations. Do NOT redistribute observed events outside the
  operator org. The repository forbids dependence on
  `J-Bax/copilot-token-tracker` (CI guard at
  `scripts/check-no-copilot-token-tracker-dep.ts`) — operators MUST
  use the official events.jsonl surface.
- **Risk**: Medium. Events include repository paths and prompt
  context fragments; redaction of body is required before persistence.
- **Fallback**: No Copilot fallback. Disabled adapter means Copilot
  usage is not observed.
- **Acknowledgment**: Required at version 1.

## ollama-log

- **Surface**: Local Ollama runtime log file (per OS / install path)
  emitting model invocation entries.
- **Default state**: `allowed` — Ollama is a local-only runtime and
  the operator owns the log file outright.
- **ToS notes**: Ollama is open source under MIT; no third-party ToS
  applies. The adapter still respects the operator's
  `automation_class` setting (e.g., to disable in test environments).
- **Risk**: Low. All data is local.
- **Fallback**: None required.
- **Acknowledgment**: Not required at version 1, but recorded
  acknowledgement is preserved if the operator opts in via the UI.

## lm-studio-log

- **Surface**: LM Studio local runtime log file. Same shape as Ollama.
- **Default state**: `allowed`.
- **ToS notes**: LM Studio is operator-controlled local runtime. No
  third-party ToS applies to log access. Confirm internal operator
  policy for log retention before activation.
- **Risk**: Low.
- **Fallback**: None required.
- **Acknowledgment**: Not required at version 1.

## openclaw-gateway

- **Surface**: OpenClaw on-host gateway service emitting structured
  invocation events to Paddock's local channel.
- **Default state**: `allowed` — OpenClaw is an internal Paddock
  service.
- **ToS notes**: OpenClaw is operator-controlled and ships under the
  Paddock license. No external ToS applies.
- **Risk**: Low.
- **Fallback**: None required.
- **Acknowledgment**: Not required at version 1.

## provider-quota

- **Surface**: Provider quota / rate-limit health endpoint adapter.
  Polls a provider-supplied API for per-account quota state.
- **Default state**: `restricted`.
- **ToS notes**: Polling provider APIs counts against the operator's
  rate-limit budget. Configure poll cadence per the provider's
  published acceptable-use policy.
- **Risk**: Low. Quota responses contain integer counters only.
- **Fallback**: When disabled, entitlement detection falls back to
  `tier_inference` and `manual` sources per FR-134a.
- **Acknowledgment**: Required at version 1.

## manual-post

- **Surface**: Operator-driven manual ingestion endpoint
  (`POST /api/observability/manual`) for replaying captured events.
- **Default state**: `allowed`.
- **ToS notes**: This adapter only ingests payloads the operator
  affirmatively posts; no third-party ToS applies. The posted
  payloads still pass through the standard redaction pipeline
  (FR-219n).
- **Risk**: Low. Operator-controlled input.
- **Fallback**: None required.
- **Acknowledgment**: Not required at version 1.
