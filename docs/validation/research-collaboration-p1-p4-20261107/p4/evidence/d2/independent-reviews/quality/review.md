# D2 independent quality review

Verdict: PASS. No reproducible P1/P2 finding within the reviewed D2 scope.

Reviewed 2026-11-08 (Asia/Shanghai) in `/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science`, branch `codex/research-collaboration-p1-p4-20261107`, HEAD `9cc757cc980a0385eba8d404d6b04fcb4a48a2cb` plus uncommitted candidate. This review used requesting-code-review and verification-before-completion skills. No production/test/repository content was changed; no commit, merge, external API, installed application/configuration or formal-data action occurred. Probe state was exclusively disposable `/tmp` state and removed in finally.

## Exact boundary

D2 source boundary was read from `p4/evidence/d2/source-delta.json`: 11 changed + 2 added relative to the preserved D1 manifest, not the full uncommitted branch diff. Read collector/totals schemas, store admission/settlement/recovery/change implementation, projection, child/executor/adapter propagation, Native observation helpers and managed-Bot backend branch. Adjacent preexisting service/budget/team ownership implementation was inspected to assess transaction/cancellation/lock interactions. D3 UI is outside this review.

Frozen source manifest SHA256: d2ba0e6f72190bb5d44e286ddf0f47f025cb34589f204ecc767e95f08573bc5c.
Frozen candidate manifest SHA256: 8238f81f258e5f39a0d5af5a82eb6046e32a65f9d6cf5118f7739ea73bd42bcf.
All 1950 candidate entries match current bytes. Separate source/tests/build verification repeats those same checks (3900 checks overall), no mismatch. See manifest-check.log.

## Fresh verification

- `npx vitest run --project node tests/orchestration/agent-usage-totals.test.ts tests/protocol/agent-usage-totals.test.ts tests/runtime/native-usage-observation.test.ts tests/workbench/bot-usage.test.ts tests/subagent/child-task.test.ts tests/subagent/task-recovery.test.ts tests/runtime/session-usage.test.ts tests/integration/subagent-child.test.ts`: exit 0, 8 files / 70 tests PASS, 6.32s. Full log: focused-tests.log. Includes real Native/Pi disposable localhost Bot usage, installed SDK session/tool/schema identities, ordinary built-child continuation, missing receipt remediation, recovery/reopen, legacy/generation, cancellation and overflow coverage.
- `./node_modules/.bin/tsx /tmp/dawn-d2-quality-20261108-MtflZB/boundary-probe.mts`: exit 0. Full script preserved alongside boundary-probe.log. Proves atomic memory/disk/active-ledger rollback by making the orchestration directory temporarily unwritable-as-a-directory, restoring it, retrying the same epoch, rejecting duplicate settlement and reopening with exactly one charge. Proves two-child interleaved completion plus admitted cancellation and queued same-child successor: child input 15, other input 11, four runs and budget 38 exactly once. Runs deterministic 2000-epoch invalid/fractional/unsafe/overflow/missing/partial fuzz with schema validation and 6000 nondecreasing safe field checks.
- Probe's first `.ts` launch was an ESM/CJS top-level-await fixture failure before execution; preserved as boundary-probe-module-fixture-error.log, corrected by running the identical script as `.mts`. Not a product failure and no production workaround.
- `npm run typecheck`: exit 0. Full log: typecheck.log.
- `git diff --check`: exit 0, empty diff-check.log.

## Quality assessment

Settlement's existing active owner/child/epoch guard precedes the new cumulative mutation. Cumulative values and the existing single budget charge are in the same Store.change cloned-state/validation/atomic-rename transaction. No second charging call or formula change was introduced. Recovery uses the same transaction, consumes only admitted active entries once, then clears them; pure legacy projections remain nonpersisting and do not backfill last-result observations.

Missing/partial/unsafe delta fields preserve already proved lower bounds; partial flags are monotone, SDK placeholder zeros do not create asserted known-zero cumulative fields, and count/schema cross-checks reject inconsistent records. Fixed missing-receipt error/aborted messages now mark incompleteness even when accompanied by known receipts.

The no-settings Native helper snapshots preexisting branch IDs and gathers only subsequent entries, without task scope or schema/tool mutation. The helper itself transparently rethrows the original work error; service-level thrown work remains an unknown admitted settlement. Existing-settings and remote branches remain the existing single scoped capture and conservative unwrapped unknown paths respectively. Tests validate same-session reuse across teams and absence of contract/settings creation in ordinary managed Bot execution.

## Boundaries not claimed

This review did not repeat the prior 107-file suite or perform a fresh full build, Electron viewport/UI, packaged app, remote ACP runtime, Windows/Linux, slow-machine, real external-provider/quota pilot or process-kill/fsync durability test. Failed-write rollback was tested at the synchronous filesystem failure boundary, not an OS crash in the rename window. Same-session output ownership relies on the existing caller/scheduler locking contract; arbitrary concurrent direct calls to the low-level helper are not a supported replacement for that lock. Historical Electron shutdown 7.35s / 20.69s remains OPEN, with no 1500/4000ms timeout adjustment. These are retained verification boundaries, not new D2 P1/P2 findings.
