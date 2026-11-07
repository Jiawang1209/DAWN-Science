# D1 current member context candidate

Re-frozen 2026-11-08 (Asia/Shanghai), after remediating the first SPEC review P2 duplicate-lease finding, following the C3 source snapshot. D1 implementation and the checks below are complete; independent SPEC and quality reviews remain root gates before D2. No commit, merge, push, release, installed application/configuration/credential/database operation or external model request was performed.

## Result and contract

Each ordinary subagent, team child and managed Native Bot execution can report its own current retained-context reading. This is independent of `TaskObservation`, `chargeObservation`, cumulative token usage and budget accounting. No D2 counters, pricing or D3 UI have been added.

`AgentContextSample` is a strict bounded numeric sample with `version: 1`, `observedAt`, `provider`, `model`, and an availability discriminant. `available` requires finite nonnegative `usedTokens`, including legitimate zero, and always declares `source: sdk-estimate`. `unknown` forbids `usedTokens`, declares `source: unknown`, and permits only fixed reasons (`unsupported`, `no-current-route-anchor`, `after-compaction`, `sdk-unavailable`, `sample-failed`). No provider-live occupancy source is claimed. Optional positive capacity is sourced independently from `model-config`; missing capacity never creates a percentage.

Optional `composition` contains only `systemBytes`, `toolBytes`, `messageBytes`, and `source: retained-bytes-estimate`. These are estimates of retained visible UTF-8 content, not token allocation, complete serialized request size, provider request contents, or reasoning size. The projection counts actual retained system text, public tool definition fields and supported public message content; excludes thinking/redacted/reasoning blocks and private nested fields; and exports no underlying strings.

Independent child stdout message: `{type: 'context_observation', sample}`. Older children which do not emit it continue to work. The host adds `{ownerSessionId, childId, epoch, sample}`. No owner/child identity supplied by a child is trusted. Final host-resolved provider/model are bound before actual spawn; execution context is captured inside the real run/spawn/send scope, separately from steering and task settings. Managed Native event callbacks capture this per-turn binding rather than looking up ALS later.

`run.contextObservation` is distinct from `run.observation` and exposes `{current, reason, sample?}`. Current eligibility exists only in the service's matching active entry/epoch, non-aborted controller and current route binding with a newly admitted sample. Unknown numeric availability can still be a fresh current observation. Persisted optional samples are history only; disk reads and recovery cannot restore `current`. Ending/cancelling or rebinding a route immediately removes eligibility. Awaiting a fresh same-route/new-epoch reading is `awaiting-sample`; `route-changed` requires an actual route difference proven in the active epoch. Prior bound history remains inspectable.

Samples from stale bindings, wrong routes, stopped entries, old epochs, foreign durable identities and strictly older timestamps are rejected. Same reporter/stdout delivery is ordered, so distinct samples with an equal millisecond timestamp are admitted without fabricating a timestamp; exact equal-time duplicates do not write. A valid duplicate is nevertheless admitted to a fresh current binding: sample admission and persistence changes are separate results, so the new binding becomes current and invalidates observation once without a write, waiter wake or budget change.

## SDK behavior and privacy

Installed Pi 0.86.0 `AgentSession.getContextUsage()` uses a recent valid assistant usage anchor plus estimates of trailing retained messages. It is not an independent provider occupancy endpoint. The shared sampler requires the exact latest valid SDK anchor to match the current provider/model and to occur after the latest compaction. SDK null/undefined readings do not become zero or fall back to old usage receipts. The legacy main `contextUsage` shape remains compatible, using the same producer and capacity. Its preexisting `estimated` flag still means the SDK result differs from its usage anchor; all new D1 samples explicitly retain `sdk-estimate` provenance.

Pi emits `message_end` before synchronously appending that message. Boundary sampling therefore runs in a coalesced microtask after persistence. Text/thinking deltas never trigger context traversal; identical semantic samples (including availability/reason/route/capacity/composition and excluding only `observedAt`) do not emit again. Each execution observer resets deduplication, and disposal cancels pending work. Subscriber/reporter failures are isolated and never echo raw exception values. Pure sampling, main context reads and live/disk overview reads do not persist or advance revisions. Only admitted host-bound events persist history and invalidate the existing observation channel; no execution wait generation, stage timing, progress/stuck state, permissions, contracts, budget run or token charges are changed.

## Source boundary

Compared with `p3/evidence/c3/full-suite-remediation/src-sha256.json`: 628 prior source files, **617 unchanged**, **11 changed**, **2 added**, **0 removed**; 630 current source files. No UI source file changed.

Changed: `src/orchestration/{execution-context,run-overview,service,store}.ts`, `src/protocol/{index,run-overview}.ts`, `src/runtime/native.ts`, `src/subagent/{child,executor,protocol}.ts`, `src/team/runner.ts`.

Added: `src/protocol/agent-context-observation.ts`, `src/runtime/agent-context-sampler.ts`.

New tests: `tests/runtime/agent-context-{sampler,native}.test.ts`, `tests/orchestration/context-observation.test.ts`, `tests/subagent/context-observation.test.ts`. Existing `tests/runtime/compaction.test.ts` gains real route-bearing fixtures and explicit regression assertions for missing SDK readings and cross-model anchors.

## Verification

All evidence is preserved under `evidence/d1/` (also originally captured in `/tmp/dawn-p14-d1-20261107`).

- Initial sampler stub assertion RED: **6 failed / 1 passed**, then **7 passed** (`02`, `04`). The earlier missing-module discovery is retained in `01` rather than represented as an assertion proof.
- Service/context projection RED: **3 failed**, then **3 passed** (`05`, `09`). Ordinary execution needs neither steering nor task settings; timing, budgets, waiter revision, read-only bytes and history are checked.
- Main adapter RED: **2 failed / 21 passed**, then adapter plus actual Node transport **25 passed** (`10`, `12`). Missing SDK data no longer borrows old totals; wrong-model anchors are rejected.
- Independent executor/team stdout RED: **2 failed** before wiring (`11`), then real Node child processes succeed using host-resolved definition/member routes (`12`). These are offline protocol children, not provider calls.
- Observer ordering/failure RED: **2 failed / 8 passed**, then **10 passed** (`14`, `15`). The test calls the installed SDK `AgentSession.getContextUsage` implementation directly, checks compaction/model/capacity behavior, tests post-persistence microtasks, and shows 1,000 text deltas cause no extra branch reads.
- Semantic deduplication RED: **1 failed / 9 passed**, then **10 passed** (`17`, `18`).
- Same-route/new-epoch reason RED: **1 failed / 2 passed**, then **3 passed** (`21`, `22`).
- Equal-millisecond changed reading RED: **1 failed / 3 passed**, then **4 passed** (`23`, `24`). Strictly older/exact duplicate samples do not write or invalidate.
- Initial broad focused regression: **86 Node files / 832 tests passed**, including protocol, orchestration/store/overview, all subagent/team suites, Native orchestration, compaction and the new producer/transport tests (`26-focused-final.log`).
- Two additional privacy/bounds assertions were then added without source changes. Final D1 targets: **5 files / 42 tests passed**, including those assertions and the main adapter (`28-final-d1-targets.log`).
- Initial final TypeScript check passed (`29-typecheck-final.log`); the post-SPEC check also passed (`32-spec-typecheck.log`).
- Full Electron + CLI + UI build passed before and after remediation (`25-full-build.log`, `34-spec-full-build.log`); existing Vite chunk-size advisory remains.
- Managed Native offline assembly test passed: a real SDK session is created outside ALS, its prompt is replaced with a gated local fixture, and events arrive from the test's outer scope. It checks ordinary no-settings binding, current unknown before first anchor, available tokens/capacity/visible bytes equal to main API, no private reasoning in overview, and history after scope end. It does not claim a model API response (`16`, `28`).
- `git diff --check` passed.

The complete source manifest is `evidence/d1/src-sha256.json`, SHA-256 **f579bf5eef6922e2b7a95b1be0e7854568f3ee69fd0116eb8f9d2c018c15bf70**. `source-delta.json` records the exact comparison; `candidate-sha256.json` freezes D1 source/tests and available build artifacts.

## SPEC duplicate-lease remediation

The first SPEC review found that `OrchestrationStore.observeContext` returned the same false result for a valid exact duplicate and a rejected sample. After a same-epoch/same-route rebind, a fresh producer could emit exactly the prior sample at the same millisecond; the service left its new binding unobserved. Producer semantic deduplication could then leave that binding awaiting forever.

An integrated fixed-clock producer/service regression reproduced this: **1 failed / 4 passed** (`30-spec-duplicate-lease-red.log`). The store now returns a typed `{accepted, changed}` result. An admitted duplicate establishes fresh binding eligibility and causes one observation invalidation when transitioning to current, while leaving disk bytes, execution wait revision and budget unchanged. Already observed duplicates remain no-ops; strictly older and stale binding reports remain rejected. The regression now passes **5/5** (`31-spec-duplicate-lease-green.log`).

Post-remediation broad focused regression: **86 Node files / 835 tests passed** (`33-spec-focused-final.log`), including all additional privacy assertions and the new integrated regression. Typecheck and full build passed (`32`, `34`). `git diff --check` passed. The pre-review source/artifact/evidence manifests and original delivery report remain preserved as `*-before-spec.*`; the initial source manifest SHA was `33e00daac842900962ef48c002eb3f69ef618175e958fa2a385019e3764d4db6`. The current manifest hash above is the post-remediation candidate.

## Remaining boundaries

D1 has no new actual-Electron UI exercise because D3 has not wired UI presentation. C3's earlier runtime/screenshots remain historical evidence, not screenshots of this new source snapshot. No model quota was consumed; a current-model real API pilot remains pending new authorization. The closed old 27/30 trial's unused three calls are not reusable authorization.

The previously recorded shutdown observations **7.35 s / 20.69 s remain OPEN**. No 1500/4000 ms timeout was increased or reclassified. Formal installed-app data, configuration, credentials and other repositories were untouched.
