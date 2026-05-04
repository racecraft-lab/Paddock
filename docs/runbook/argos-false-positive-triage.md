# Runbook: Argos False-Positive Triage

> Status: SPEC-008 T225 (FR-373, FR-394, FR-090l)

---

## 1. Symptom

- An Argos snapshot fails on a non-deterministic UI element
  (timestamps, unresolved Suspense, animation frame).

## 2. Impact

- CI red on a UI-only diff.

## 3. Diagnose

- Compare the diff overlay; identify the volatile element.

## 4. Mitigate

- Mask the element via a Storybook decorator
  (`<MaskTimestamp />`).

## 5. Recover

- Re-run the snapshot; if green, accept.

## 6. Validate

- Subsequent runs stay green.

## 7. Postmortem

- Add the masked element to the Storybook deterministic-rendering
  guide.
