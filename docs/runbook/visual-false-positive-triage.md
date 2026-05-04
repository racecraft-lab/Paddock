# Runbook: Visual False-Positive Triage

> Status: SPEC-008 T225 (FR-373, FR-394, FR-090l)

---

## 1. Symptom

- A visual snapshot fails on a non-deterministic UI element
  (timestamps, unresolved Suspense, animation frame).

## 2. Impact

- CI red on a UI-only diff.

## 3. Diagnose

- Open the workflow artifact report and compare the actual, expected,
  and diff images.
- Identify the volatile element and confirm the source component is
  deterministic under fixed seed data.

## 4. Mitigate

- Mask the element via a Storybook decorator or Playwright fixture.
- Prefer deterministic seed data and fixed browser time over broad masks.

## 5. Recover

- Re-run the affected visual workflow.
- Confirm the manifest gate still verifies the expected snapshot count,
  tags, source file metadata, and screenshot hashes.

## 6. Validate

- Subsequent runs stay green without accepting unrelated diffs.

## 7. Postmortem

- Add the masked or deterministic element to the Storybook
  deterministic-rendering guide.
