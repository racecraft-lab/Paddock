# SPEC-012B Fixture Boundaries

Fixtures are small offline mini-repositories for harness-gardening guard tests.

- Each case lives under `scripts/spec-012b/fixtures/{fresh,hard,warning,dedupe,errors}/...`.
- Each case has one `fixture.json` and may include a `repo/` mini-tree.
- Fixture paths are normalized before reads.
- Absolute paths, parent traversal, Windows separators, and symlink escapes are unsafe.
- The guard must not read live HAL, GitHub, Paddock, database, scheduler, or runtime state.
- `specs/**` cleanup fixtures are recommendation-only and must never delete or move files.
