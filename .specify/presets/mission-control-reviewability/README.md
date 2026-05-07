# Mission Control Reviewability Preset

This project-local Spec Kit preset keeps Mission Control's reviewability budget
and PR review packet requirements out of core `.specify/templates/*.md`.

Spec Kit resolves templates in priority order:

1. `.specify/templates/overrides/`
2. `.specify/presets/<id>/templates/`
3. `.specify/extensions/<id>/templates/`
4. `.specify/templates/`

The preset is registered in `.specify/presets/.registry` with priority `5`.
After a Spec Kit upgrade, verify it is still active:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

If any command resolves to `.specify/templates/*.md`, restore this preset or the
registry entry instead of editing the core template files directly.
