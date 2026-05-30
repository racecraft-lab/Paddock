# Security Checklist: SPEC-013C

**Purpose**: Validate authorization, input safety, redaction, and secret-handling requirements before implementation.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Authorization And Abuse Resistance

- [x] Mutation requires the existing operator role; admin qualifies through the role hierarchy.
- [x] Viewer access remains read-only through the reconciliation read model.
- [x] Actor identity comes from authenticated context only, never from request body fields.
- [x] Mutation rate limiting is required before parsing and before state mutation.
- [x] Feature-flag-off mutation returns unavailable without state change.
- [x] Missing or malformed idempotency keys fail without mutation.

## Persistence Safety

- [x] Audit payloads use a positive allowlist.
- [x] Raw request bodies, raw idempotency keys, prompts, transcripts, GitHub bodies, auth headers, provider payloads, and tokens are prohibited from persistence.
- [x] Operator strings are trimmed, bounded, and secret-scanned before persistence.
- [x] Secret detector failures fail closed.
- [x] Error responses use closed sanitized categories.
- [x] Idempotency persistence stores only key and request hashes, not opaque raw inputs.
- [x] Same-key different-body replay is a validation error rather than a second mutation.

## Result

Pass. No open gap markers remain for security requirements.
