# Contract: Workflow Template API And Editor Persistence

## Scope

This contract covers `/api/workflows` and the live Workflows editor in `src/components/orchestration-bar.tsx` for SPEC-004 chain fields.

## Scope Resolution And Authorization

- All workflow-template list, create, update, usage-tracking update, and delete operations resolve Product Line scope through `resolveWorkspaceScopeFromRequest`.
- Create, update, and delete require operator authorization and a concrete single workspace/Product Line scope.
- Facility aggregate scope is rejected for writes and deletes.
- Explicit Product Line scope must not fall back to `auth.user.workspace_id`.
- Unauthorized workspace ids are rejected.
- The editor calls `/api/workflows` through `appendScopeToPath` for list, create, update, usage tracking, and delete.

## Workflow Template Payload

Create and update requests validate, persist, and return:

```ts
type WorkflowTemplateChainFields = {
  slug: string;
  output_schema: unknown | null;
  routing_rules: Array<{
    expression: string;
    target_template_slug: string;
  }>;
  next_template_slug: string | null;
  produces_pr: boolean;
  external_terminal_event: string | null;
  allow_redacted_artifacts: boolean;
};
```

Existing non-chain workflow-template fields remain compatible with the current API.

## Validation

- `routing_rules` must be empty or absent unless `output_schema` is present.
- `next_template_slug` is valid without `output_schema`.
- Chain fields must preserve null-default safety.
- Validation failures return an operator-visible field-level error.
- Workflow-template delete by query parameter remains supported: `DELETE /api/workflows?id=<template_id>`.
- JSON-body delete may remain as backward-compatible behavior but is not required by the editor contract.

## UI Journey Contract

A real running-app Playwright test must cover:

1. Authenticate as an operator.
2. Select a concrete Product Line/workspace scope.
3. Create a workflow template with chain fields.
4. Read back the saved chain fields in the editor.
5. Edit `output_schema`, `routing_rules`, `next_template_slug`, and downstream metadata snapshots.
6. Verify routing-rules-without-schema rejection appears in the UI.
7. Verify static `next_template_slug` without schema saves.
8. Update usage-tracking fields without losing chain fields.
9. Delete through the query-parameter delete path.

Component-only tests may supplement this journey but do not satisfy acceptance.

