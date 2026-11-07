# Independent P1-P4 budget and lifecycle premerge review

Result: PASS within the inspected scope. No reproducible P1/P2 finding. No source/test/evidence files in the repository were modified by this reviewer.

Workspace: /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science
Base supplied by parent: main/HEAD 9cc757cc. Reviewed current uncommitted changes, not an earlier delivery report.

## Freshly reviewed material

- Tracked diff: src/orchestration/budget.ts, store.ts, service.ts; src/protocol/run-budget.ts; src/team/scheduler.ts, science-pipeline.ts, science-pipeline-tools.ts.
- Current lifecycle context: src/team/science-batch.ts, recovery.ts, scheduler.ts dispatch/stop/settle/catch/finally paths.
- New untracked tests/team/science-review-budget.test.ts, existing changed orchestration store/service tests and science-batch tests.
- Initial/final scoped diff byte comparison passed; review.diff and review-final.diff are identical.

## Invariants traced

Canonical owner/pipeline/cycle tuple validation; owner rejection on read and mutating calls; durable frozen task-attempt bindings; atomic epoch/charge/review consumption; same-cycle predecessor-drain guard with different-cycle overlap; no refund after admitted cancellation; queued cancellation without admission charge; service and task-level drain checks before release; repeated stop and terminal cancellation reconciliation; held/recovery-check retention after disabling policy or lowering limits; cold-recovery marking, explicit verified resume and consumed-review retry generation; separate hidden parallel checkpoint identities and capacity aggregation independent of truncated diagnostic event history.

## Executed evidence

Command from workspace:

    ./node_modules/.bin/vitest run tests/orchestration/store.test.ts tests/orchestration/service.test.ts tests/team/science-review-budget.test.ts tests/team/science-batch.test.ts --project node --maxWorkers 1

Exit 0: 4 files, 71 tests passed. Full stdout: targeted-tests.stdout. Duration 5.52 seconds.

Additional repository-external, runnable integration scenario:

    node --import ./node_modules/tsx/dist/loader.mjs /tmp/p14-budget-review.lBhhti/parallel-consumed-review-recovery.ts

Exit 0. Creates only disposable state under this review directory. Runs two parallel pipelines until both independent reviews have been admitted (6 consumed), stops and drains them, constructs a fresh store/service/scheduler, explicitly resumes the batch after verification, and asserts both retries use budgetGeneration 1, exactly two backend calls occur after resume, four distinct reservation records remain consumed, and final batch completes at 9 consumed runs (including the fixed host summary). Full stdout: parallel-consumed-review-recovery.stdout. The script removes its temporary session state in finally.

The first script invocation failed before execution because /tmp had no ESM package scope; package.json containing type=module was then added only in this review directory and the scenario rerun successfully. No model/API calls were used.

## Boundaries

This review does not certify all P1-P4 UI/observation work, real provider behavior, real API budget/pilot balance, Electron behavior, full-suite behavior, cross-platform or historical OS timing. No build, full suite, git mutation, model API, installed-app profile access, or formal-data mutation occurred. Existing 1500/4000 budgets were not changed. No claim is based on old 6813-pass or 15-Electron results.
