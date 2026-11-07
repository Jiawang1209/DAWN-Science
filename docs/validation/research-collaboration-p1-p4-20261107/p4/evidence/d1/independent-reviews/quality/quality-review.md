# D1 independent quality review — PASS

Reviewed frozen worktree `/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science` on 2026-11-08 (Asia/Shanghai). Read-only review; no source/test/repository evidence edits, commit, merge, push, release, external model call, formal installed-app/configuration/credential/database operation. New review files are isolated under this `/tmp` directory.

## Verdict

**PASS for the D1 quality gate. No concrete new P1/P2 finding.** D2 cumulative/financial counters and D3 UI are outside this gate. The existing shutdown OPEN observations are unchanged.

## Reviewed behavior

- Read both new untracked source modules and all 11 changed D1 source files. Checked strict numeric schemas, capacity provenance, fixed unknown reasons, retained public byte projection, legacy main API adaptation, independent child events, host route/identity/epoch binding, Native send-time ALS capture, persistence and read-only live/disk projections.
- `service.ts:62-84` requires the active entry and exact binding object, non-aborted epoch and host-frozen route. Stale lease, wrong route, invalid strict payload and stopped execution cannot qualify a sample. A route difference is reported only when the saved sample belongs to the active epoch.
- `store.ts:319-330` separates admission from persistence. Exact duplicates return `{accepted:true,changed:false}`; the service can make a fresh lease current once without writing the state or advancing execution generation. Older reports are rejected. Changed same-millisecond samples retain ordered-stream semantics.
- Compared sampler rules with installed Pi 0.86.0 `getContextUsage`, `calculateContextTokens` and `estimateContextTokens`: SDK usage is an anchor plus trailing estimates. The sampler never labels it provider-live or borrows an older matching anchor after a newer foreign route/compaction; null/missing data remain unknown. The legacy estimated flag preserves its existing difference-from-anchor meaning.
- `agent-context-sampler.ts:9-38,73-90` counts only projected public retained content, emits numbers and route identity, and does not serialize whole states/messages. Thinking/redacted/reasoning blocks and private nested fields are excluded. Boundary microtasks coalesce adjacent events after Pi persistence, deltas do not traverse branches, semantic dedup excludes only observedAt, and disposal suppresses queued work.
- Ordinary executor/team events bind inside actual execution and do not depend on steering/taskSettings. Native captures the per-send binding before its long-lived callback events and disposes it in synchronous cleanup (`native.ts:3157-3163`). Existing child compatibility is retained.
- D1 events reach only bound sample history and the observation invalidation path; no new charge, wait generation, progress/stage timing, execution admission, permission or contract mutation was introduced.

## Fresh verification performed by this reviewer

1. `npx vitest run tests/runtime/agent-context-sampler.test.ts tests/runtime/agent-context-native.test.ts tests/runtime/compaction.test.ts tests/orchestration/context-observation.test.ts tests/subagent/context-observation.test.ts` — **5 files / 43 tests passed**, exit 0, 2.18 s. Includes actual installed SDK offline assembly and real local stdout child processes; no model response/API claim. Raw output: `focused-tests.log`.
2. `npm run typecheck` — exit 0. Raw output: `typecheck.log`.
3. `git diff --check` — exit 0. Raw output: `diff-check.log`.
4. Independent external `.mts` producer/service probe — PASS: two concurrent children keep their own values; malformed identity-bearing and older samples cannot write; cancelling one child invalidates only its eligibility; 20 repeated live/disk reads preserve bytes, observation stamp, execution revision and budget; disposal suppresses an already queued microtask and new observers re-emit their initial sample. Preserved script/output: `independent-probe.mts`, `independent-probe.log`.
5. All **630 source files** match the frozen source manifest, SHA-256 **f579bf5eef6922e2b7a95b1be0e7854568f3ee69fd0116eb8f9d2c018c15bf70**. Independently recomputed C3 delta: 11 changed, 2 added, 617 unchanged, 0 removed, no UI source changed. Pre/post/final source hashes identical. All **21 candidate-manifest files** present and matching. Evidence: `source-verification.json`, `candidate-verification.json`, `pre-source-sha256.json`, `post-source-sha256.json`.

## Limits and tooling note

This review did not rerun the implementer's broad 86-file/835-test suite or full build; those remain preserved implementation evidence. No D1 Electron UI or external model API exercise was performed. D3 is responsible for new actual UI runtime evidence; historical C3 screenshots are not treated as this source snapshot. The 7.35 s / 20.69 s shutdown observations remain OPEN and no timeout change is accepted here.

The first external probe attempt used a `.ts` file outside an ESM package, so tsx selected CommonJS and failed to load the SDK's ESM-only export. Its raw loader output is preserved as `independent-probe-initial-cjs-loader.log`; running the same probe as `.mts` succeeded. This was a probe packaging issue, not a product failure. No product edit was made.
