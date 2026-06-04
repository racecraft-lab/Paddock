# Workflow Contract Export

Family: paddock
Workspace: 1
Validation Status: latest successful canonical snapshot
Template Count: 9
Contract Hash: workflow-contract-hash-v1:sha256:823aa2bbc62837a832a98ca7a8e0b0205cdb896e8f62ce6b08d62bc03d3d3c28

## Templates

### Paddock Aegis

- Slug: `paddock_aegis`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:550d4f65cdd150c972eb2805ab574a90d5e19ed179d4a5ba72dded4ae5f92bce`

```text
Perform Aegis review for {{task.title}} in {{workspace.name}} using the owner packet and verification evidence.
```

### Paddock Close Issue

- Slug: `paddock_close_issue`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:e5661240f7c93cdfed9d346797fb3d525fb5f4ea76ebd80df0c6f79af78c7ed5`

```text
Prepare a close recommendation for {{task.title}} in {{workspace.name}} without dispatching implementation work.
```

### Paddock Dev Implementation

- Slug: `paddock_dev_implementation`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:a6eea3242cd82e27800f9a2cc676e36c51c1a9629df0747ee6e561058afe3cf0`

```text
Implement {{task.title}} in {{workspace.name}} using the approved remediation plan. Return verification evidence.
```

### Paddock Issue Triage

- Slug: `paddock_issue_triage`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:a8be1d72d89179269b017187ad040a7cada426d1196c3f2c0d251309c3afc6f5`
- Output Schema Hash: `sha256:dff53bf32c0d62aff4937f4c53a458bb3bd6be18607125620cffc63763b649cb`

```text
Triage {{task.title}} for {{workspace.name}}. Preserve GitHub issue context from {{github.issue_number}} and return JSON with disposition and rationale. Use ACTIONABLE_REMEDIATION only when the issue is reproducible and has a bounded Paddock remediation path; otherwise use DUPLICATE, OBSOLETE, INVALID, NEEDS_HUMAN, NEEDS_SPECIALIST, or NEEDS_SPEC.
```

### Paddock Needs Spec Route

- Slug: `paddock_needs_spec_route`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:c0d5cb22aaad91995920ea8c324a8b85d2aabcd4b3cec8ea06427ec9d948b4af`

```text
Prepare a SpecKit handoff for {{task.title}} in {{workspace.name}}. Do not create the spec or launch autonomous work.
```

### Paddock Owner Review

- Slug: `paddock_owner_review`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:cc06307d6a7aaa8a562f0ff51c20142d6604d0d0b71fdd2e18149fd3bdda1148`

```text
Summarize {{task.title}} for operator owner review in {{workspace.name}}. Do not merge or close the issue.
```

### Paddock Remediation Plan

- Slug: `paddock_remediation_plan`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:f19083049d04433f32f5b1b54902daad6fb8db871baf33fea3a3d106ab4616c0`

```text
Plan remediation for {{task.title}} in {{workspace.name}} using the linked GitHub issue and repository evidence.
```

### Paddock Review

- Slug: `paddock_review`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:ca45ccb687785ed157780ea50fdf76d2860df1b853be4b27ef8b1af17fe69332`

```text
Review implementation evidence for {{task.title}} in {{workspace.name}} and return pass or required fixes.
```

### Paddock Specialist Route

- Slug: `paddock_specialist_route`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:a2805388e776a0d2bf71d9cdeea7b4df8b0312c3bdb511ce1f9e68f4bbf36240`

```text
Route {{task.title}} for {{workspace.name}} using the triage result and repository area labels from {{github.labels}}.
```
