# C1 independent code quality review
Worktree: /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science
Review date: 2026-11-07
Verdict: CHANGES REQUESTED — one P2 must-fix.

## Scope
Read-only review of collaboration-outcome.ts and its tests; collaboration-model acceptance helper/tests; resultEpoch protocol/producer addition; optional public batch taskIds projection/schema and the two producer callers/tests. Other A/B work was read only as necessary to understand host invariants. No repository edits, commit, merge, push, release, formal app access, or external model API calls. Temporary fixtures and this report live under /tmp.

## P2 — Resolve batch feedback actions to the task that actually blocked
Location: src/ui/collaboration-outcome.ts:180-183, especially line 181.
batchOutcome picks a stopping task, then aggregateTaskId, then items[index].currentTaskId before it knows why the result is blocked.
1. Serial batches retain the live checkpoint in team.pipeline; publicScienceBatch emits item.currentTaskId only for item.checkpoint. Normal serial blocked snapshots therefore return inspect-feedback with no actionTarget, despite a known pipeline.currentTaskId.
2. Parallel advanceParallelBatch interrupts siblings then projectParallel selects the first unfinished item. If item Two fails while One is active, batch.index and team.pipeline point to interrupted One. The new selector returns a blocker describing Two but actionTarget points to One, so the feedback button opens the wrong attempt.

Reproduction: batch-navigation-repro.mts uses existing completedVersionedPipeline helper, startScienceBatch, claim/settle/advance reducers, taskTeamSnapshot, RunOverviewSchema.parse, then selectCollaborationOutcome; no handcrafted public team data.
Observed parallel: failedId=p-1-two-check-0-0; projected pipelineTask=p-0-one-check-0-0; batch item One interrupted, Two blocked; outcome blocker begins Two, target task:["versioned","p-0-one-check-0-0"].
Observed serial: blocked p-0-one-check-0-0 is in explicit taskIds and team.pipeline, but Outcome has no target.
Evidence: batch-navigation-repro.log.
Required correction: choose the target from the resolved state and the actual blocked item/receipt, use the owned serial pipeline currentTaskId when no serial item checkpoint is exposed, and retain actual stopping/drain priority. Add serial and second-parallel-item-failure regressions through real projection/reducer paths.

## Strengths
- Small pure projection API; actions carry only navigation intent, with version-aware artifact locators.
- Current epoch acceptance and task-owned attempt receipts are separated from stale inspection artifacts; direct binding takes precedence over bounded history.
- Final pipeline proof follows declared dependencies and content versions, identifies exact accepted analysis/review tasks, keeps prior analyses stage-scoped, and keeps route synchronization separate.
- Optional exact public task membership is backward compatible, bounded, deduplicated, and only adopts an owned serial pipeline. Both production callers pass the current pipeline.
- Historical selected-run pendingReview correction is present and tested, including mismatched receipt versions.

## Count/helper coherence assessment
hasCurrentAcceptance is broader than Outcome scientific acceptance: it permits contract=false and accepted full receipts without versions, whereas Outcome does not. The actual executor generates acceptance through contract-bound task submission/finalization; no supported ordinary freeform path producing an accepted receipt was found. Existing coordinator-only tests can inject such data, but this is not an additional P1/P2 without an actual production producer. The stricter selector requirement is appropriate for presenting accepted scientific artifacts.

## Validation
- focused-tests.log: 5 files / 77 tests passed.
- scope-tests.log: 12 files / 136 tests passed, including existing collaboration workbench and all science-batch test files. Integration scenarios use deterministic localhost inference with isolated /tmp workspaces; no external provider credentials/API.
- typecheck.log: tsc --noEmit exit 0.
- git diff --check exit 0.
- batch-navigation-repro.log: exit 0, both serial and parallel snapshots pass RunOverviewSchema; defect reproduced despite green existing tests.
No new Electron/UI layout validation claimed; C1 exposes an as-yet unwired selector and layout is outside scope.
