# Contract: Shared Task Creation

## Module

`src/lib/task-create.ts`

All production task creation must call this module. Direct runtime `INSERT INTO tasks` outside this module is forbidden.

## Public Result

```ts
type CreateTaskResult = {
  taskId: number;
  task?: unknown;
  activityIds: number[];
  notificationIds: number[];
  subscriptionRecipients: string[];
  outboundSync: {
    githubQueued: boolean;
    gatewayQueued: boolean;
  };
};
```

The public contract must not expose raw database driver results.

## Source Profiles

### API Task Creation

Defaults:

- Allocate project ticket.
- Insert task.
- Log `task_created`.
- Subscribe creator.
- Resolve mentions and reject unresolved mention tokens.
- Subscribe and notify resolved mention recipients.
- Subscribe and notify assignee.
- Enqueue GitHub push when project sync is enabled and a repository exists.
- Enqueue gateway push when configured.
- Broadcast `task.created`.
- Return parsed task.

### GitHub Issue Import

Defaults:

- Preserve duplicate detection and GitHub metadata.
- Insert through shared creation.
- Log import activity.
- Broadcast `task.created`.
- Avoid creator/assignee subscriptions, mention validation failures, notifications, and outbound GitHub/GNAP pushes unless explicitly opted in.

### GitHub Sync Import

Defaults:

- Preserve canonical GitHub columns and anti-ping-pong semantics.
- Insert through shared creation.
- Log sync-created activity against the created task id.
- Avoid broadcast, subscriptions, notifications, ticket allocation, and outbound pushes unless explicitly opted in.

### Recurring Task Spawn

Defaults:

- Allocate project ticket when the template has a project.
- Insert through shared creation inside the existing recurrence transaction.
- Update template recurrence metadata atomically with child creation.
- Log recurring-spawn activity.
- Avoid broadcast, subscriptions, notifications, and outbound pushes unless explicitly opted in.

### Pipeline Successor Creation

Defaults:

- Run insert and internal database side effects inside the `advanceTaskChain` transaction.
- Call shared creation exactly once.
- Inherit lineage/workspace/project metadata.
- Set parent and workflow-template metadata.
- Use source-profile defaults needed for successor parity.
- Defer GitHub/GNAP outbound pushes until after the outer transaction commits successfully.

## Transaction Contract

The helper supports caller-owned transactions for recurring task spawn and pipeline successor creation. Internal database side effects honor the caller transaction. External outbound side effects are represented as post-commit intents when required by the caller.
