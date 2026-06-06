# Quickstart: Product Line B Onboarding Smoke

## Preconditions

- Run from the SPEC-010B worktree.
- Use `pnpm`.
- Use Node.js >=22 locally.
- For HAL service-compatible checks, use `/usr/bin/node` v24.15.0 because interactive `node` on HAL can resolve to a newer ABI that may not match `better-sqlite3`.
- Do not run optional live GitHub evidence without explicit operator approval.

## Disposable DB Smoke

Set paths:

```bash
DB=/tmp/spec-010b-paddock.db
CONFIG=docs/ai/product-lines/product-line-b.yaml
RUN_ID=SPEC-010B-LOCAL-$(date +%Y%m%d%H%M%S)
EVIDENCE_DIR=test-results/spec-010b-product-line-b-smoke
EVIDENCE_PACKET=$EVIDENCE_DIR/spec-010b-smoke-evidence.json
```

Run migrations or use the repository's existing disposable DB setup path before seed checks.

Create the local evidence directory before recording JSON output:

```bash
mkdir -p "$EVIDENCE_DIR"
```

Preflight without mutation:

```bash
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode preflight --json
```

Apply disabled Product Line B:

```bash
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode apply --json
```

Verify disabled Product Line B:

```bash
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode verify --json
```

Record existing-target/idempotency evidence:

```bash
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode apply --json
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode apply --allow-existing --json
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode verify --json
pnpm seed:product-line -- --config "$CONFIG" --db "$DB" --mode verify --json
```

Run the SPEC-010B smoke lifecycle after implementation:

```bash
node --experimental-strip-types scripts/spec-010b/product-line-b-smoke.ts --config "$CONFIG" --db "$DB" --phase enable --run-id "$RUN_ID" --json
node --experimental-strip-types scripts/spec-010b/product-line-b-smoke.ts --config "$CONFIG" --db "$DB" --phase synthetic-issue --run-id "$RUN_ID" --json
node --experimental-strip-types scripts/spec-010b/product-line-b-smoke.ts --config "$CONFIG" --db "$DB" --phase disable --run-id "$RUN_ID" --json
node --experimental-strip-types scripts/spec-010b/product-line-b-smoke.ts --config "$CONFIG" --db "$DB" --phase cleanup-proof --run-id "$RUN_ID" --evidence "$EVIDENCE_PACKET" --json
```

Write the final review packet to:

```text
test-results/spec-010b-product-line-b-smoke/spec-010b-smoke-evidence.json
```

Required local evidence:

- Preflight `mutation_status: not_mutated`.
- Preflight before/after hash parity.
- Apply leaves `product-line-b` disabled.
- Verify passes against `product-line-b.yaml`.
- Apply without existing-target allowance refuses an already valid target with `mutation_status: not_mutated` and `action_required: --allow-existing`.
- Apply with existing-target allowance creates no duplicate config-owned rows and records stable before/after seed snapshot hashes when the target is already valid.
- Repeated verify remains read-only with stable Product Line A and Product Line B scoped counts/hashes.
- Exactly one synthetic issue-shaped smoke item.
- Product Line A before/after scoped hashes match.
- Product Line B final `disabled_at` is non-null.
- Product Line B repo sync owner count is zero.
- Product Line B remaining eligible smoke work is zero.

Required cleanup counters:

- `github_sync_enabled_projects: 0`
- `repo_sync_owner_projects: 0`
- `assigned_dispatch_eligible_tasks: 0`
- `remaining_eligible_smoke_work: 0`
- `unintended_side_effect_rows: 0`
- `product_line_a_snapshot_parity: passed`
- Product Line B final `disabled_at` is non-null.
- Every smoke-owned flag is absent or explicitly false after final disablement.

## API/Dashboard Evidence

When the app is running and dashboard assertions are in scope:

```bash
curl -sS "$MC_URL/api/status?action=dashboard&workspace_id=$PRODUCT_LINE_A_WORKSPACE_ID"
curl -sS "$MC_URL/api/status?action=dashboard&workspace_id=$PRODUCT_LINE_B_WORKSPACE_ID"
```

Assert:

- Product Line A dashboard metrics match the baseline.
- Product Line B metrics are scoped during the smoke enablement window.
- Disabled Product Line B is not selectable in the normal dashboard switcher after seed or final disablement.

## HAL UAT

Use the HAL service-compatible Node path:

```bash
/usr/bin/node --experimental-strip-types scripts/seed-product-line.ts --config docs/ai/product-lines/product-line-b.yaml --db /home/fredrick-gabelmann/paddock-data/paddock.db --mode preflight --json
```

HAL evidence should be saved under an operator-owned path such as:

```text
/home/fredrick-gabelmann/paddock-evidence/spec-010b/spec-010b-smoke-evidence.json
```

After local verification and explicit operator approval for HAL:

- Confirm `paddock.service` is active.
- Confirm `openclaw-gateway.service` remains active.
- Run preflight and record no-mutation proof.
- Apply Product Line B disabled state only when preflight is ready.
- Verify Product Line B.
- Enable only the smoke window.
- Record synthetic issue evidence.
- Disable Product Line B.
- Record cleanup proof and Product Line A isolation hashes.

Optional live GitHub evidence:

- Requires explicit operator approval.
- May find/reuse one safe open Product Line B smoke issue or create exactly one issue.
- Must not repair labels, comment, close, delete, create PRs, enable repo sync ownership, or mutate Product Line A state.
- Missing credentials, insufficient permissions, or operator refusal records `mutation_status: not_mutated` and does not fail required synthetic smoke.

## Final Checks

Run focused checks first, then broaden as implementation scope requires:

```bash
pnpm test -- src/lib/__tests__/product-line-b-seed.test.ts src/lib/__tests__/product-line-b-smoke.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Run Playwright only if dashboard/switcher behavior or tests change:

```bash
pnpm test:e2e -- tests/product-line-b-dashboard-scope.spec.ts
```
