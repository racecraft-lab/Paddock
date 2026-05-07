# Workflow Contract Export

Family: mission-control
Workspace: 1
Validation Status: latest successful canonical snapshot
Template Count: 2
Contract Hash: workflow-contract-hash-v1:sha256:2f0e9ef6e21ca80039c49bc6398bf8f7bd1493be454ff5d7e381391b4b8884da

## Templates

### Mission Control Implementation

- Slug: `implementation`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:a6eea3242cd82e27800f9a2cc676e36c51c1a9629df0747ee6e561058afe3cf0`

```text
Implement {{task.title}} in {{workspace.name}} using the approved plan and verification commands.
```

### Mission Control Intake

- Slug: `intake`
- Model: `sonnet`
- Prompt Version: `v1`
- Routing Rule Hash: `sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`
- Output Schema Hash: `sha256:35de5b90eb8853f6f4ad33341674e3b0e7231c1d16d438cb52994be484c47d69`

```text
Review {{task.title}} for {{workspace.name}} and produce a bounded implementation brief.
```
