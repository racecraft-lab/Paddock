# Codex Ask Questions Preset

Repo-local Codex companion for the community `claude-ask-questions` preset.

Claude Code exposes `AskUserQuestion`; Codex does not expose that Claude-only tool. This preset keeps the same interaction goal for Codex by instructing Codex skills to use the structured `request_user_input` path when the active Codex runtime exposes it, and to fall back to one concise plain-text question when it does not.

The current Spec Kit preset installer registers command presets for all detected agents. To avoid writing Codex-specific instructions into Claude skills, this preset is applied only to `.agents/skills/speckit-clarify` and `.agents/skills/speckit-checklist` in this repository.

Do not install the upstream `claude-ask-questions` preset with `specify preset add` in this multi-agent repo until Spec Kit supports agent-scoped preset registration.
