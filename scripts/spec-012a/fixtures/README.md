# SPEC-012A Knowledge Index Fixtures

These fixtures exercise `scripts/spec-012a/verify-repo-knowledge-index.mjs`
without copying a full repository tree. Fixture mode loads the real
`docs/ai/repo-knowledge-index.json`, applies the mutations in `fixture.json`,
and compares emitted stable finding codes with `expected.codes`.

Fixture mode must not require network access, secrets, `.envrc.local`, LM
Studio, or `.gitnexus/`. It is intended to run on a clean checkout through:

```bash
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-doc
```

Stable finding codes covered by these fixtures:

- `required_entry_missing`
- `metadata_missing`
- `required_link_broken`
- `status_pointer_stale`
- `related_spec_invalid`
- `external_link_warning`
- `wikilink_warning`

