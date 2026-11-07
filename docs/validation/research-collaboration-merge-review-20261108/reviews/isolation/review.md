# Fresh pre-merge isolation review

Result: PASS for assigned execution-generation, observer and old-entrypoint isolation scope. No newly identified reachable P1/P2. This is not a claim that all P1-P4 behavior or the later adapter correction is complete.

Baseline: worktree /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science, HEAD 9cc757cc980a0385eba8d404d6b04fcb4a48a2cb, uncommitted P1-P4 tracked diff plus relevant untracked sources/tests inspected directly. The parent announced a distinct confirmed P2 and controlled forthcoming edits in executor/scheduler/backend to preserve known usage diagnostics when acceptance throws on cancellation. That issue is outside this PASS and must be independently closed by its RED/GREEN test and re-review. This reviewer made no repository changes.

Fresh checks:
- focused-vitest.log: 7 files / 73 tests passed, start 01:26:49, duration 3.17 s.
- lifecycle-channel-vitest.log: 3 files / 122 tests passed, start 01:27:36, duration 2.17 s.
- Total 10 files / 195 passing tests. Both commands exited 0. These are local Node/UI and SDK/child-process fixtures, not provider API or real long Bot/MCP stopping runs.

Code conclusions:
- service.ts:58-84: taskAttempt derives from the active admitted epoch. Context reporters bind host-owned owner/child/epoch and frozen route; active entry identity, aborted signal, binding identity, durable epoch and strict numeric payload validation reject old reporters. Cancellation revokes context current before drain completes; disk projections are historical.
- native.ts:1727+, 1845+, 2864+, 3170+, 4072+, 4680+: current-instance checks suppress old coordinator/team notices; attach replays current service stamp without incrementing it, detach closes over the exact sink set; final retire is identity guarded and publishes disk:0 only for the installed service. start/stop guards prevent ordinary same-ID replacement while cleanup is pending. Existing replacement tests use controlled map injection as adversarial guards, not as proof that user code can bypass lifecycle guards.
- runner.ts/executor.ts: route bound immediately at actual spawn matches the provider/model in the child spec; child context payload cannot supply owner/child/epoch. Native send captures ALS identity and subscribes on the actual SDK session; listener cleanup revokes pending sampling.
- protocol/run-overview.ts, events.ts: dedicated strict runOverviewChanged packet bypasses transcript mutation; client.ts keeps malformed or valid dedicated packets out of regular subscription revision logic. Electron subscriptions detach on window close.
- use-run-overview.ts:17-98: client+owner cache shares one in-flight read, one requested tail and one settled poll timer. Sequence and stamp guards reject pre-notice disk/old service replies, lower revisions and retired observers; disk hints do not prematurely retire a live observer. Owner/client changes and final unsubscribe invalidate late replies and clear subscriptions/timer.
- read-current-snapshot.ts: readonly file read plus owner/id validation; does not call mutating scheduler reads. Private task settings and frozen definitions are removed, raw botOwnerContext is discarded; live Bot owner context comes only from the trusted bridge. Strict public schemas fail closed on malformed payloads.
- agent-observation.ts:22-45: current display additionally requires same owner+child+epoch, membership in the supplied snapshot, live source, running phase+state and available SDK estimate; historical values require owner/child and epoch <= current. Unknown is never rendered as zero. Task detail requires timeline current and exact teamId/taskId/attemptId/attempt binding on both current timeline run and snapshot member, preventing old tasks from borrowing a new assignment.
- run-overview.tsx and collaboration-task-detail.tsx retain process/handoff/artifacts/records tabs, source description, expand/return, child transcript and evidence/artifact entrypoints. Their actual Electron interaction remains parent-owned fresh verification.

Limits retained:
- Historical OS timing failures 7.35 s / 20.69 s remain OPEN. This review did not change 1500/4000 ms limits or replace old failures with normal-exit evidence.
- Actual long provider Bot/MCP stopping and cross-platform/slow-machine behavior were not exercised; no API, formal profile, credentials or production DB were used.
- No full build/full suite/Electron run was performed by this reviewer; parent is running its own fresh build and targeted runtime evidence.
- D3 short cumulative usage label remains the already specified P3 non-blocker; details explicitly distinguish input/output/cache and member-wide scope. No new misleading evidence was found.
