# D3 independent SPEC review

Verdict: **PASS**. No P1/P2 finding. One non-blocking P3 copy recommendation below.

Review target: `/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science`, HEAD `9cc757cc980a0385eba8d404d6b04fcb4a48a2cb`; A–D3 remains uncommitted. Read-only review: no source/test edits, builds, API calls, official app/profile/credential/DB operations, commits or merge. All review output is in this unique temporary directory.

## Independent evidence

- Exact path-set plus SHA256 verified for all 634 src and all 625 dist files against both candidate manifests. No missing, extra or mismatched file. Recomputed pilot delta has precisely the declared 8 UI paths, including 2 additions. `hash-verification.json` contains full results and recomputed deltas.
- Frozen `dist/electron/subagent-child.js` SHA256: `96b1f3e966c391d88fb45fa9524dbb61d4b0203da6ac4cbf69ae41f577d7063e`.
- Independent targeted UI run: **8 files / 115 tests passed**, exit 0, Vitest 2.69s (outer process 2.923s). Tests: agent-observation, collaboration-model/workbench/workflow, context-meter, use-run-overview, run-overview, run-budget. Raw stdout and command/result retained.
- Independent `/tmp` probe: **42 assertions/cases passed**, exit 0. All manufactured snapshots are accepted by `RunOverviewSchema`; checks cover live/disk/unsupported and active/stopping/terminal states, foreign owner/child/future epoch, older epoch history, host revocation/route/awaiting states, available versus unknown and missing capacity, zero/partial/overflow/unsettled/legacy usage, exact timeline-to-member assignment chain, and 4 actual host JSON records from final/disk evidence.
- Actual archived host JSON independently projected: current `20 / 128,000 tokens`; subsequent historical `29 tokens`, settled input+output `80 tokens`, cacheRead `未记录`; retired snapshot has source=disk and no meter.
- Actually viewed archived `detail-current-900-light.png` and corrected `retired-disk-history-1440-dark.png`: details readable; current estimate and model capacity sources separated; composition retained byte wording present; historical 29 vs cumulative 80 and disk source visibly distinct; no current meter on disk. This review did not launch new Electron or consume a pilot run.
- Inspected final full Node/UI stdout (671 files, 6813 passed / 10 skipped, 134.57s) and disk capture stdout (1 passed, 22.6s), plus verification manifests/report. These are implementation-run evidence, not new independent full-suite/Electron executions.
- Post-review exact src/dist identity and git porcelain status match pre-review. See `post-review-identity.json`.

## Specification and actual callsite audit

1. Ordinary roster: `run-overview.tsx:27,76-81` reads the existing shared `useRunOverview` value, maps canonical snapshot runs and passes the explicit owner to AgentObservation. Direct detail at lines 101-105 uses the selected canonical snapshot run.
2. Network: `collaboration-network.tsx:9-19` maps snapshot.runs into AgentObservation. No new read or poller. Width 210px and row pitch 252px agree with CSS min-height 226px; selected-node final rule uses panel surface plus inset accent.
3. Member cards: `collaboration-workflow.tsx:35-38` maps filtered snapshot runs into the same component. Existing filtering, team dependencies and expand/return route remain intact.
4. Exact task detail: `run-overview.tsx:45` obtains `teamTaskTimeline(...exact attempt).current`; `collaboration-task-detail.tsx:17` calls `exactTaskObservationRun`, which rechecks owner, canonical child+epoch, team address and all four taskAttempt fields for both timeline current and member. It does not read assignee context. Independent actual timeline probe confirms a successor binding cannot expose the old task's current context.
5. Projection: `agent-observation.ts:24-35` requires matching sample owner/child/exact epoch, snapshot membership, live source, state+phase running, host current/reason=current, available SDK source. Detached advanced epoch, disk, stopping/cancelled/drained, route change/awaiting and restart history cannot get a current bar. Only matching owner/child with sample epoch <= run epoch can retain available SDK history. Provider/model is taken from that sample. No parent contextUsage read.
6. Numbers: `agent-observation.ts:9-19` uses host-epoch-deltas only, safe per-field integers plus safe cross-field input+output sum, partial lower bound, missing fields without zero fill, and distinct fresh-unsettled / legacy-uncovered / valid-zero cases. cacheRead appears separately in details. Budget and D2 settlement code is unchanged from pilot. Usage is expressly member scope across turns/tasks, not this task's cost.
7. Presentation: `agent-observation-view.tsx:13-21` renders SDK origin separately from model-config capacity, Date bound, retained system/tool/message bytes with explicit exclusions, separate cacheRead and unknown cost. No price lookup or placeholder zero/free inference. Current unknown/missing capacity creates no percentage.
8. Scope preservation: full pilot hash delta proves no D3 backend/protocol/poller/App-grid implementation changes. The 8 changed paths are precisely the delivery list. Existing results/handoff/evidence/version/budget/expand-return behavior is exercised by the targeted tests, backed by implementation Electron evidence.

## Non-blocking P3 copy recommendation

Location: `src/ui/agent-observation-view.tsx:10`; compatibility formatter `src/ui/agent-observation.ts:21`; English entries `src/ui/i18n/en.ts:2861,2877`.

The detailed D3 plan says cards use `已结算累计输入+输出`, while the candidate card and compatibility formatter say `已结算累计`. This is a minor plan copy deviation: the compact view does not itself identify the exclusion of cacheRead. It is **P3, not a P1/P2 semantic defect**: the actual arithmetic is input+output only, the card distinguishes settled history from occupancy, the reachable details explicitly name input/output, separate cacheRead, cross-task member scope and unknown cost, and both existing and independent checks confirm that behavior.

Smallest future improvement: rename only that label and its formatter/English translations to `已结算累计输入+输出` / `Settled input + output`; adjust label assertions and check 210px card wrapping. No extra metric, price feature or backend change is indicated. This recommendation is not required to invalidate the frozen candidate or repeat completed broad verification. If adopted, it is a new source/build candidate and needs its own affected label/layout verification and hashes.

## Limits retained

No fresh full Node/UI, Electron, kernel, cross-platform, external-provider billing/scientific validation or full 919 desktop execution in this independent review. Local fixture uses real host wiring with localhost inference. Long real Bot/MCP stopping remains unverified; historical 7.35s / 20.69s shutdown OPEN is not cleared by D3's normal close samples. Nothing in the UI review requires cancellation/drain implementation expansion.
