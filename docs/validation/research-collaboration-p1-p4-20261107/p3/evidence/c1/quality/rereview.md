# C1 quality re-review — PASS
Date: 2026-11-07
Supersedes the P2 change-request verdict in review.md for the current working tree.
Scope: only batch navigation selector refinement and new reducer/projection regression tests, retaining previous C1 scope findings and validation.

## Closed P2
Re-ran the unchanged independent real-reducer reproduction:
- serial concurrency 1: blocked p-0-one-check-0-0 now has the exact matching task selectionKey.
- parallel concurrency 2: failed p-1-two-check-0-0 now has the exact matching task selectionKey although batch.index and team.pipeline still point to interrupted p-0-one-check-0-0.
Both snapshots continue to pass RunOverviewSchema.
Evidence: batch-navigation-rereview.log; original script batch-navigation-repro.mts unchanged.

## Ordering and scope review
- Actual bound stopping task remains first; cancellation group-run actionTarget from projectBatchOutcome remains authoritative.
- Aggregate targets are preferred while aggregating/completed or with their own current blocked/invalid receipt.
- Parallel blocked target comes from the blocked item's currentTaskId, positive attempt/attemptId, terminal blocked/invalid receipt, and explicit batch membership when supplied.
- Serial fallback uses a valid pipeline checkpoint whose current task belongs to explicit complete batch.taskIds; blocked fallback additionally requires blocked pipeline status and current blocked/invalid receipt. Legacy partial membership fails closed.
- Newly added tests exercise real serial and second-parallel-item failure, stopping priority, and active/blocked host summary navigation.

## Verification
- rereview-tests.log: 6 files / 95 tests passed (Outcome, helper, workbench, batch reducer, host overview, protocol batch).
- rereview-typecheck.log: tsc --noEmit exit 0.
- git diff --check exit 0 during source inspection.
No remaining P1/P2 identified. No repository edits or external API calls. No new Electron/layout validation claimed.
