# D1 independent SPEC review: PASS

Reviewed worktree: /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science
Final source manifest SHA-256: f579bf5eef6922e2b7a95b1be0e7854568f3ee69fd0116eb8f9d2c018c15bf70

Original P2: service.ts:78 only established binding.observed when store.observeContext mutated history. After same-epoch/same-route rebinding, an exact equal-millisecond first reading was suppressed as duplicate, leaving awaiting-sample. Observer semantic deduplication could suppress later unchanged boundaries indefinitely.

Fix reviewed: observeContext returns typed {accepted, changed}; admitted duplicates can establish fresh lease eligibility without writing history. Service invalidates only when history changes or eligibility first becomes current. Old binding/epoch/controller/route guards remain before admission.

## Actual independent checks and results

Commands were executed in the worktree above using stdin JavaScript. Preserved probe files reproduce the exact JavaScript bodies; invoke from that worktree as:

    node --import tsx --input-type=module < /tmp/dawn-d1-spec-review-20261108/integrated-observer-probe.mjs
    node --import tsx --input-type=module < /tmp/dawn-d1-spec-review-20261108/lease-guards-probe.mjs

The original observer probe produced current / awaiting-sample / awaiting-sample. Rerun unchanged after remediation produced current / current / current.

The final additional assert probe passed: stale lease exact duplicate and newer payload, fresh older sample, and wrong route cannot establish current; fresh exact duplicate establishes current with exactly one observation invalidation, unchanged state bytes, unchanged execution revision and budget revision; repeated duplicate is a no-op; reporting after scope end cannot revive current.

Fresh target command:

    ./node_modules/.bin/vitest run --project node tests/runtime/agent-context-sampler.test.ts tests/runtime/agent-context-native.test.ts tests/runtime/compaction.test.ts tests/orchestration/context-observation.test.ts tests/subagent/context-observation.test.ts --cache=false

Result: 5 files / 43 tests passed. Initial pre-remediation run was 5 files / 42 tests passed.

    ./node_modules/.bin/tsc --noEmit
    git diff --check

Both exited 0 with no stdout after remediation.

Python hashlib validation independently found 630 source files and 21 candidate files, zero mismatches. Source manifest SHA matched above. Compared with pre-SPEC candidate, only service.ts, store.ts, context-observation.test.ts and built dist/electron/main.js changed. D1 delta from C3 remained 11 existing source changes + 2 new source files, with no UI source changes.

## Archive provenance and limits

This archive was created only at final handoff, without rerunning checks. The *.log files are verbatim relevant stdout preserved from this review's tool transcript, not preexisting redirected process log files. Typecheck/diff success is recorded above from exit codes. Probe temporary stores were removed in finally blocks.

No source, test, report, formal app, config, credential or DB modifications were made by the reviewer. No commit, merge, push, release, real model request or Electron UI exercise. Broader 86-file/835-test and full-build checks were implementer evidence, not independently rerun here. D2 totals and D3 UI remain future scope; historical shutdown timing remains open. A white-box missing-route sample/legacy call throws ZodError, but regular Native startup always supplies a resolved model; absent demonstrated reachable production path, it was not promoted to a P1/P2 finding.
