/**
 * SPEC-008 — Governance soak harness (T275) AC-Soak-1.
 *
 * Per FR-224, FR-350, FR-357.
 *   - 30 min @ 100 admissions/sec
 *   - p95 < 15 ms
 *   - RSS growth < 50 MB (10s sampling, p99 of 5-30 min minus
 *     p5 of 0-5 min warmup)
 *   - zero SQLITE_BUSY
 *   - zero defer:retry_exhausted in steady state
 *
 * Wired to `pnpm test:soak` per T276. The scaffold ships as an
 * empty entry point; the production driver lands when the
 * evaluator under-test is fully wired.
 */

async function main(): Promise<void> {
  process.stdout.write(
    'governance-soak: scaffold — full 30 min driver pending evaluator wiring\n',
  );
}

void main();
