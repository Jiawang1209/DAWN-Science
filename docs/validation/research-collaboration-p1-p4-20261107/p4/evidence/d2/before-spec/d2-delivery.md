# D2 settled cumulative member usage candidate

Frozen 2026-11-08 (Asia/Shanghai), after D1 SPEC/quality acceptance. D2 implementation and the checks below are complete; independent SPEC and quality reviews remain root gates before D3. No commit, merge, push, release, installed application/configuration/credential/database operation, new dependency, pricing change or external model request was performed. Tests use disposable state, in-memory SQLite and localhost model fixtures.

## Result and field contract

Optional `ChildRecord.usageTotals` and optional `RunOverview.runs[].usageTotals` share the strict `AgentUsageTotals` schema:

```ts
{
  source: 'host-epoch-deltas',
  input?: number, output?: number, cacheRead?: number,
  partial: ('input' | 'output' | 'cacheRead')[],
  settledEpochs: number, unknownEpochs: number,
  lastSettledEpoch?: number,
  legacyHistory?: true
}
```

These are **recorded, settled** host deltas for one durable owner/child identity. They are not in-flight estimates, a current-model aggregate, a whole Bot session total, a price or a claim of complete historical coverage. New children explicitly start with zero tracked settled/unknown epochs, empty partial coverage and **no token fields**. The schema has no migration/default that silently grants this coverage to old records.

`settledEpochs` counts admitted epochs settled or recovered after tracking began. `unknownEpochs` counts those tracked epochs with any missing, partial, unsafe or overflowing field; it does not invent the number of older historical rounds. `partial` is the monotone per-field incompleteness union, also including all fields when `legacyHistory` is true. A fully observed later epoch adds its known delta without erasing older coverage gaps. Known values from other fields are retained. The SDK's unverified zero plus `partial` never creates a new numeric zero field. Explicitly observed zero without partial coverage is allowed.

Token and coverage counts are nonnegative safe integers; unknown epochs cannot exceed tracked settled epochs. Last-settled binding, duplicate partial fields, missing-field coverage, zero-epoch shape and legacy coverage are validated. Unsafe provider deltas and unsafe sums are omitted per field, retain earlier known sums and mark incompleteness. They do not invalidate otherwise successful work.

## Admission, recovery and compatibility

The existing `settleRun` active-ledger guard still rejects stale/duplicate/late epochs. Usage is accumulated **once in that same `Store.change` transaction**, before the existing single `chargeObservation` call. Failed and cancelled admitted runs retain any proved usage and count once. Missing observations count as unknown. Cancelling queued/unadmitted work adds no settled epoch and no charge. D1 context samples and pure overview reads change no usage, budget or execution progress.

Constructor recovery adds one unknown tracked settlement per unfinished **admitted** active-ledger epoch before clearing that ledger, within the same durable change. Reopening again does not repeat it. Queued work never acquires a usage settlement. Legacy running children without an admission ledger remain explicitly historical/incomplete without inventing an admitted count or new token charge; the existing conservative legacy budget view is unchanged.

Pure disk/live projections synthesize an explicit `legacyHistory: true`, all-fields-partial view for absent old totals, with **zero tracked** settled epochs and absent token fields. This does not mean zero historical consumption. Reads never persist or backfill the old last-result observation. The first newly settled epoch on such a child preserves the legacy marker. Reconstructed old subagent metadata, direct old continuation paths and restored team members with older turns are marked historical without copying old last-result numbers into the aggregate. New member generations have distinct child identities and start their own counters, including when execution directories or Bot sessions are reused.

## Actual capture paths and unchanged semantics

`runChildTask` now returns `TaskObservation` for ordinary tasks as well as tasks with settings. Contract trace/evidence/submission behavior remains gated exactly as before; no default settings or additional permissions are introduced. Session-creation failures remain unknown. `child.ts` still captures branch-entry IDs before the turn and computes `sessionUsage(newEntries, true)`; no whole-branch absolute total is substituted. Executor, mailbox and team adapters retain the observation through host settlement, including admitted cancellation diagnostics.

Local managed Bot requests with existing settings keep the single existing `runWithTaskScope` path. Local requests without settings use `runWithUsageObservation`, inside the existing output/session ownership scope. This helper snapshots IDs before work and reads only newly appended branch entries afterward; it creates no task scope and never mutates tool declarations, schemas or permissions. Reused sessions across teams cannot donate earlier usage. Throwing work preserves its original error/cancellation semantics; without a returned proved observation settlement remains unknown. The remote/ACP branch remains the existing unwrapped `run()` path: no parent or whole-session usage is borrowed, and absence remains unknown.

The existing metrics intentionally stay different: usage display totals remain **input + output**, with cache read separate; budget charging remains **input + output + cacheRead**. `src/orchestration/budget.ts` and `src/store/usage.ts` are byte-identical to D1. No fees or prices are added. D3 should label these as 已记录/已结算累计 and expose `partial`, `unknownEpochs` and `legacyHistory`; zero tracked legacy epochs must never be presented as zero all-history usage.

## Verification and evidence

All raw logs are in `evidence/d2/`, originally captured under `/tmp/dawn-p14-d2-evidence`. Initial fixture mistakes are retained and are not represented as feature-failure proof.

- Totals/settlement RED: **6 failed / 1 passed** after correcting test fixture APIs (`red-totals-corrected.log`). The earlier invalid cancel/context fixture attempt remains in `red-totals.log`.
- Ordinary observation RED: **1 failed / 14 passed** (`red-child.log`); after implementation the two older exact-shape assertions were updated to include only the genuine new observation, with no fabricated usage (`green-core-first.log`, `green-core.log`).
- Native usage helper RED: **1 failed** before the helper existed (`red-native.log`); real SDK session delta/tool/schema checks then passed.
- Legacy reconstruction RED: **1 failed / 6 passed** (`red-legacy-meta.log`), then historical coverage markers passed (`green-numeric-legacy.log`).
- Numeric/unknown-zero/coverage RED: **4 failed / 24 passed** (`red-numeric-unknown-zero.log`), then safe accumulation, absent unknown cache and consistency checks passed.
- Actual old D1 built child RED: **1 failed / 8 deselected**, missing ordinary observation (`red-built-continuation.log`). After the fresh build, actual Electron-as-Node subprocess plus installed SDK and localhost inference runs two continuations: each returns input/output **12/8**, the child cumulative result is **24/16**, last-epoch observation remains **12/8**, and budget known tokens are **40 exactly once**, with unknown SDK cache coverage kept partial/absent. No external provider call is made.
- The real backend no-settings Bot test runs two ordinary assignments through real Native/Pi, checks absence of contract/settings, and compares cumulative counters with the sum of the two returned scope deltas. Its initial credentials fixture error remains in `red-backend*.log`. A corrected regression mutation bypassing just the no-settings capture branch reproduces absent observations (`red-backend-no-settings-corrected.log`); the backend was restored byte-for-byte, and the corrected test passes in the final suite. The Native helper separately verifies cross-team reuse against a preexisting 1000-input session entry, unchanged tool/schema identities and unchanged thrown-error identity.
- Final D2 targets: **8 files / 64 tests passed** (`final-d2-targets.log`), covering pure old/new projection, ledger/no-ledger recovery, duplicate/stale settlement, partial fields, SDK zero, overflow, forced cancellation, unsupported observation absence, queued cancellation, new generation reset, D1 context independence and native old-team restoration. Earlier fixture-only errors and exact-optional-property correction are retained in `*-fixture-error.log`.
- Final broader focused regression: **107 Node files / 908 tests passed** (`targeted-full-final.log`). Includes all protocol/orchestration/subagent/team/Bot tests plus relevant Native, backend, actual built-child and Bot session integration suites.
- Fresh `npm run typecheck`, full Electron + CLI + UI build and `git diff --check` all exited **0**. Exact commands, timestamps and exit codes are in `verification-results.json`; raw output is in `typecheck-verified.log`, `build-verified.log`, `diff-check.log`. Existing Vite chunk-size advisory remains.

## Source boundary and remaining gates

Compared with D1's `src-sha256.json` (SHA-256 `f579bf5eef6922e2b7a95b1be0e7854568f3ee69fd0116eb8f9d2c018c15bf70`): **630 prior source files, 619 unchanged, 11 changed, 2 added, 0 removed; 632 current source files. No UI source changed.**

Changed source: `src/orchestration/{run-overview,store}.ts`, `src/protocol/{index,run-overview}.ts`, `src/runtime/{native,session-usage}.ts`, `src/subagent/{child-task,executor,orchestration,tool}.ts`, `src/workbench/backend.ts`. Added: `src/{protocol,orchestration}/agent-usage-totals.ts`.

New tests: `tests/orchestration/agent-usage-totals.test.ts`, `tests/protocol/agent-usage-totals.test.ts`, `tests/runtime/native-usage-observation.test.ts`, `tests/workbench/bot-usage.test.ts`. Existing observation/continuation/recovery tests changed only in `tests/subagent/{child-task,task-recovery}.test.ts`, `tests/runtime/session-usage.test.ts` and `tests/integration/subagent-child.test.ts`.

`source-delta.json` contains the exact D1 comparison. `src-sha256.json`, `tests-sha256.json`, `build-sha256.json` and `candidate-sha256.json` freeze all current source, tests and available build files. These are the D2 candidate, not the earlier C3/D1 runtime screenshots.

D3 presentation and its whole Node/UI suite plus actual Electron UI checks remain later gates. Electron-as-Node child transport has been exercised here; no D2 Electron viewport/UI claim is made. No external model quota was consumed; a current-model real API pilot remains pending the user's separate authorization. Historical shutdown observations **7.35 s / 20.69 s remain OPEN**; no 1500/4000 ms timeout was increased or reclassified. All earlier uncommitted A/B/C/D1 work is retained.
