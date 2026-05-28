# Accessibility And Adoption Boundary Checklist: SPEC-013C

**Purpose**: Validate that the API/debug slice does not masquerade as a complete operator UX and that SPEC-013D has the information needed to build accessible controls.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Adoption Boundary

- [x] The spec and plan explicitly state that SPEC-013C introduces no in-app operator controls.
- [x] The spec and plan identify SPEC-013D as the operator UI adoption blocker.
- [x] Closeout wording states that first real harness operation remains blocked on SPEC-013D plus SPEC-014B.
- [x] UAT is API-and-audit focused rather than presented as complete operator UX validation.
- [x] No Playwright accessibility requirement is imposed because no visible UI changes are planned.

## Future UI Support

- [x] The read model exposes `available_actions` so SPEC-013D can render enabled and disabled control states.
- [x] The read model exposes unavailable reasons so SPEC-013D can give non-visual explanations for disabled actions.
- [x] The read model exposes backoff and override requirements so SPEC-013D can require confirmation and reason capture.
- [x] The read model exposes expected-state predicates so SPEC-013D can avoid stale client-side recomputation.
- [x] The read model exposes last sanitized error state without raw diagnostics.

## Result

Pass. No open gap markers remain for accessibility/adoption-boundary requirements.
