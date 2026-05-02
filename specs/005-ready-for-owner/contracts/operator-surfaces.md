# Contract: Operator Surfaces

## Task Status Vocabulary

`ready_for_owner` is a first-class application status for reads, filters, schemas, stores, labels, and UI display.

Display copy:

- English lane label: `Ready for Owner`
- Status key: `ready_for_owner`
- Meaning: approved PR-producing work waiting for owner merge.

It remains distinct from `awaiting_owner`, which keeps its existing manual-blocked meaning and placement.

## Kanban Lane

Lane order:

```text
backlog
inbox
assigned
awaiting_owner
in_progress
review
quality_review
ready_for_owner
done
failed
```

Styling:

- Teal lane header/badge family.
- Stable dimensions consistent with existing lane cards.
- Existing `awaiting_owner` keyword detection remains unchanged and must not coerce `ready_for_owner`.

## GitHub Label

```json
{
  "status": "ready_for_owner",
  "name": "mc:ready-for-owner",
  "color": "14b8a6",
  "description": "Mission Control: ready for owner"
}
```

Rules:

- Included in status label initialization.
- Included in `ALL_STATUS_LABEL_NAMES`.
- `labelToStatus("mc:ready-for-owner")` returns `ready_for_owner`.
- Applying the label removes/replaces older `mc:*` status labels using the existing status-label replacement behavior.

## Notification Type

Normal ready-for-owner notification:

```json
{
  "type": "task_ready_for_owner",
  "title": "Ready for owner merge",
  "message_contains": "Owner action required",
  "source_type": "task"
}
```

Reconciliation notification:

```json
{
  "type": "task_ready_for_owner",
  "title": "Owner merge reconciliation required",
  "message_contains": "Owner action required",
  "source_type": "task"
}
```

Recipient order:

1. Task assignee.
2. Task creator fallback.

Rendering/delivery:

- Notification panel renders the type on existing card surfaces.
- Delivery route formatter includes action-required ready-for-owner wording.
- Webhook event mapping continues to derive `notification.task_ready_for_owner` from the existing `notification.created` event payload.

## Localization

All `messages/*.json` files receive the new lane key and notification copy keys required by the UI. English source copy is canonical; non-English files may use direct translations consistent with existing message style.
