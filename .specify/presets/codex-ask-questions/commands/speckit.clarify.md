---
description: "Codex-native structured question rendering for speckit clarify."
strategy: "append"
---

## Codex Ask Questions Override

This override applies only when the command is running as a Codex skill.

- Do not use Claude Code's `AskUserQuestion` tool in Codex.
- For each interactive clarification, present exactly one question at a time.
- If the current Codex mode exposes `request_user_input`, use it with one question:
  - `header`: short label no longer than 12 characters.
  - `id`: stable snake_case identifier.
  - `question`: include the recommended answer and reasoning before the question text.
  - `options`: 2-3 mutually exclusive choices, recommended first, with the recommended label suffixed by `(Recommended)`.
  - Do not include an "Other" option; Codex adds the free-form escape hatch.
- If `request_user_input` is unavailable, ask one plain-text question and wait for the user. Put the recommendation first, then a compact lettered list; do not render a Markdown table.
