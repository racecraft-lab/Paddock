# Security Checklist: SPEC-014A

**Purpose**: Validate sandbox key/path safety, metadata minimization, authorization, and no-launch boundaries.
**Created**: 2026-05-28
**Sources**: `spec.md`, `plan.md`, `data-model.md`, `contracts/sandbox-lifecycle-api.md`

## Path And Key Safety

- [x] CHK001 Sandbox root defaults to `<MISSION_CONTROL_DATA_DIR>/sandboxes` and any per-workspace root must pass the same bounded resolver.
- [x] CHK002 Traversal, absolute paths, separator injection, dot segments, symlink-like segments, unsafe Unicode, control characters, reserved names, overlong segments, duplicate normalized values, and root escape fail closed.
- [x] CHK003 Key segments normalize once and then pass a printable ASCII allowlist instead of being silently repaired into a different value.
- [x] CHK004 Collision handling rejects duplicate normalized keys or path evidence instead of overwriting or reusing the wrong lifecycle.

## Metadata Safety

- [x] CHK005 Persisted evidence is limited to root id, sandbox key, sanitized relative path, owner, handle id, linkage ids, timestamps, and redacted reason metadata.
- [x] CHK006 Absolute host paths, raw user path fragments, prompts, tokens, auth headers, provider payloads, raw session data, and secret-shaped strings are forbidden in lifecycle rows/events.
- [x] CHK007 Validation and lifecycle error evidence uses structured field/reason codes without echoing unsafe input.

## Access And Execution Boundaries

- [x] CHK008 Read API uses authenticated viewer access and existing workspace/task scope filtering.
- [x] CHK009 Cross-workspace lifecycle data is not returned for unauthorized task ids or lifecycle filters.
- [x] CHK010 Fake owners cannot launch, resume, stop, message, or switch to real Paddock/OpenClaw/external harness execution.
- [x] CHK011 Scope guards must prove no UI, adapter manifest, token accounting, runner launch, retry controls, successor selection, governance changes, or auto-merge code enters SPEC-014A.
- [x] CHK012 External Harness Engineering/Symphony sources are cited only as boundary context and do not introduce runner algorithms.

## Outcome

No security gaps found.
