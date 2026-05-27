---
description: "Codex-native structured question rendering for speckit checklist."
strategy: "append"
---

## Codex Ask Questions Override

This override applies only when the command is running as a Codex skill.

- Do not use Claude Code's `AskUserQuestion` tool in Codex.
- For checklist intent questions, ask only questions that materially change checklist content.
- If the current Codex mode exposes `request_user_input`, use it for up to three independent short questions in one call, or ask sequentially when one answer affects the next question:
  - `header`: short label no longer than 12 characters.
  - `id`: stable snake_case identifier.
  - `question`: include the question text and any recommendation or default.
  - `options`: 2-3 mutually exclusive choices, recommended first when there is a clear recommendation, with the recommended label suffixed by `(Recommended)`.
  - Do not include an "Other" option; Codex adds the free-form escape hatch.
- If `request_user_input` is unavailable, ask concise plain-text questions and wait for the user before generating the checklist. Use compact lettered options instead of Markdown tables.
