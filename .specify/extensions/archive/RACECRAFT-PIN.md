# Racecraft Archive Extension Pin

Installed for SPEC-002A.

## Source

- Repository: `https://github.com/racecraft-lab/spec-kit-archive`
- Corrective PR: `https://github.com/racecraft-lab/spec-kit-archive/pull/1`
- Ref: `refs/tags/v1.1.0`
- Commit: `08ee0e919a72ccb254758a2b6f51d58196490ea7`
- Tag object: `1e87928c30293aef4f75c1c3fbc46a8c43540d7a`
- Archive URL: `https://github.com/racecraft-lab/spec-kit-archive/archive/refs/tags/v1.1.0.zip`
- GitHub release: `https://github.com/racecraft-lab/spec-kit-archive/releases/tag/v1.1.0`
- Merged PR: `https://github.com/racecraft-lab/spec-kit-archive/pull/1`
- Main merge commit: `4e6ad6b34a20811f9af5e4ab5a822e47310d0271`
- License: MIT

Release-process note: this pin was created from the Racecraft fork branch and
was later published as `v1.1.0` after PR #1 merged to `main`. The tag commit is
contained in `main`; the tagged tree and merged `main` tree are equivalent for
the vendored extension files recorded below.

## Vendored Files

| File | SHA-256 |
| --- | --- |
| `.specify/extensions/archive/extension.yml` | `fb4b68b85d69d6ed546965acc6a2a7157e215d894093230574fffc11c20d7893` |
| `.specify/extensions/archive/commands/archive.md` | `0a4b128e77bcb37c9d964756020d4b19975f13f8d63060e0616f5b46c707a48f` |
| `.specify/extensions/archive/README.md` | `15d4a9f0fe5c66d5bcaaa1925ab85b9f492e092648fb1cb5fac5bbe3633283be` |
| `.specify/extensions/archive/CHANGELOG.md` | `f795322c9e51412cd4da8b4462c12f50232a9bdf894280dbbe2058bff3ea3427` |
| `.specify/extensions/archive/LICENSE` | `7abc1ff97b2ebeb16bd1b8b5ffc6936c293bc2eef3bb17095aa4e89dd6c2be10` |

## Mission Control Safety Policy

Archive Sweep runs before requested spec work and excludes the current target
spec. Cleanup-sensitive behavior remains dry-run-only unless the active branch
is a safe base branch and the worktree is clean. Active `specs/**` cleanup is
permitted only as a reviewed forward change after archive success, merge or
tree references, recovery commands, and `safeToApplyCleanup=true` have been
recorded.

The archive extension must not rewrite git history and must not rely on
post-merge CI mutating `main`.
