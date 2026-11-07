# D3 QUALITY and P1–P4 final integration review

**D3 QUALITY: PASS. Final P1–P4 integration audit: no identified P1/P2 blocker.**

Reviewed 2026-11-08, read-only, at `/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science`, branch `codex/research-collaboration-p1-p4-20261107`, HEAD `9cc757cc980a0385eba8d404d6b04fcb4a48a2cb` plus the frozen uncommitted implementation. This is an independent quality and integration review, after the separate D3 SPEC PASS. It does not authorize a commit, merge, push, release, installed-app replacement or a new real-provider run.

## Frozen scope and identity

- Independently recomputed exact path-set and SHA256: **634 src + 625 dist**, all equal the final candidate manifests. Manifest SHA256: src `d63c1aeb618793f7980aa6e3ec6aeb349bd4ddbbb1af30a246f1cd23ac50a04f`; dist `96f733049a46567744cf28e379ca35c48804bb61049957743c7f0b84c7eb36bf`.
- Recomputed actual pilot-to-final source delta equals the declared **8 UI files**, including two new projection/view modules. D3 is not confused with the whole A–D2 uncommitted branch diff. No backend, schema, sampler, store, usage, budget or pilot execution source changed after the real pilot.
- Recomputed behavior-regression-to-final source delta is only `src/ui/styles.css`; actual child bundle still SHA256 `96b1f3e966c391d88fb45fa9524dbb61d4b0203da6ac4cbf69ae41f577d7063e`.
- Post-review src, dist, and all source/tests/e2e/scripts hashes equal pre-review. Candidate HEAD and porcelain status unchanged. Main remains clean at the same HEAD. See `pre/post-identity.json`, `pre/post-{src,dist,protected}.json`, `post-verification.json` and `reviewed-path-inventory.json`.

## Fresh review execution

| Check | Result | Evidence |
|---|---|---|
| Actual focused Vitest Node/UI, 26 existing files selected explicitly | **346 passed**, exit 0, Vitest 5.35s / outer 5.69s | `focused-command.json`, `focused-tests.log`, `focused-result.json` |
| Reviewer-authored cross-stage Store/Service/Timeline/UI probe | **18 integration cases passed**, exit 0 | `cross-stage-probe.mts`, `cross-stage-probe.log`, `cross-stage-probe.exit` |
| Retained frozen-pilot read-only auditor copied outside repository and re-executed | **115/115 checks passed**, exit 0; no generated-code execution | `pilot-audit-reexecution/{audit.py,stdout.log,stderr.log,report.json,report.md,exit.txt}` |
| Independent source delta, full-suite stdout and raw exit evidence checker | **16 checks passed**, exit 0 | `evidence-check.py`, `evidence-check.log`, `evidence-check.json` |
| `npm run typecheck` | exit 0, 3.28s | `typecheck.log`, `static-results.json` |
| `git diff --check` | exit 0 | `diff-check.log`, `static-results.json` |

The 346 tests cover D3 projection/components and retained overview/workflow/model/outcome/refresh/budget behavior; D1 sampler, actual Native wiring and ownership; D2 totals/protocol/no-settings Native-Bot/session deltas; orchestration service/overview; reservation scheduler and protocol; research manifest, gate, diagnostic submission/transcript paths. This is a focused integration suite, not another full-suite run.

The independent integration probe exercises real temporary Store/Service instances through admission, route binding, available zero, unknown samples, exact team timeline, successor task assignment, cancellation/stopping, partial settlement, review reservation consumption and reopen. It proves member input+output **20** versus budget input+output+cache **21**, cache lower bound 1, unknown coverage retained, no extra charge on observation or repeated read, no old-task current borrowing, no current meter while stopping/disk, no scientific accepted status from mere execution completion, duplicate settlement atomic rejection, and recovery once-only unknown plus review hold. Disposable state is deleted.

Probe tooling failures are retained: initial external probe expected Chinese while the standalone module uses the product's default English. Its first error was obscured by an unreleased test gate in cleanup and emitted an unsettled top-level-await warning. The final probe explicitly sets its own locale and releases every probe gate in finally; the original attempted script/log and exposed locale assertion log remain. The one abandoned disposable directory was removed and recorded in `probe-cleanup.json`. No product/test edits or product workaround was made.

## D3 quality assessment

The new metric projection is pure and centralized. Roster, network, member cards and direct/task details reuse it from the existing shared overview; neither new module owns a subscription, fetch, transcript scan, parent context lookup, scheduler action or billing mutation. Numeric validation protects absent values, unsafe sums, genuine zero, partial lower bounds, legacy uncovered history and unsettled members. Current context and settled history have separate sources and labels, with cacheRead in details and unknown cost explicitly retained.

Current occupancy requires live source, snapshot membership, running state and phase, exact bound owner/child/epoch, host current/reason and available SDK source. Reliable model-config capacity alone permits a meter. A foreign owner/child or future epoch supplies neither current nor historical numbers. Route/lease/restart/cancel/awaiting states cannot borrow current eligibility; Date-out-of-range rendering is guarded. Composition is retained public-content bytes, clearly excludes hidden reasoning and is not labeled token decomposition or actual request size.

Task detail follows `teamTaskTimeline(...exact attempt).current` before `exactTaskObservationRun` rechecks canonical member/epoch, owner/team and all four taskAttempt fields. It does not use assignee identity as a context lookup. Direct detail uses the canonical snapshot run and the projection's membership guard.

Existing outcome/tool/versions/handoff/budget/recovery/expand-return paths remain reachable and exercised. Actually viewed archived final 900px expanded current, 1440px two-epoch settled history and corrected disk-source screenshots. Current 20/128000, historical 29 and settled 80 are distinguishable; selected network card is opaque and visible rows do not overlap. Narrow and expanded panels retain their existing intentional scroll behavior. These are inspected archived actual-Electron results, not a newly launched Electron run by this reviewer.

## Final cross-stage integration assessment

**A diagnostics and pilot:** Diagnostic host rejection versus SDK refusal remains distinct, unknown transcripts stay unknown, scientific acceptance is not rewritten by integrity drift. Re-executed retained auditor verifies frozen source/settings/actual child, both identical inputs, independent Decimal mean, exact version hashes, actual completed independent-review reads, 24/30 gate count with single 10 / multi 14 and work 10 / review 4, completed cleanup and scientific accepted records. Policies disable both retry layers, compaction and global-only warming in actual trial directories. This review reads retained hashes rather than reopening formal credentials/profile. It does not claim packet-level provider evidence. Remaining six requests stay closed and are not rolled over.

**B reservations and D2 settlement:** The same Store admission ledger reserves a review execution run (not an HTTP/model request). Exact owner/pipeline/cycle/task-attempt bindings survive as durable accounting; active work prevents premature release, and recovery remains explicit. D2 cumulative fields and the original one-time budget charge share Store.change's validated atomic write after the active child/epoch guard. Context observation cannot alter either ledger or wait generation. Cancellation known deltas and unknown/cache coverage are preserved, while recovery tracks admitted unknown once and never refunds runs. The independent combined probe and scheduler tests exercise these interfaces together.

**C observation and outcomes with D1/D3:** A separate observation version refreshes the existing shared snapshot while execution waiter generation remains unchanged. Current team snapshot reader stays read-only and avoids scheduler migration. Shared hook rejects stale owners, retired observers and pre-notice disk responses; owner-switch and notice regressions pass. Outcomes require accepted host receipts/version provenance; pipeline stage acceptance is not promoted to final scientific acceptance before exact independent review. D1 host route/lease/epoch eligibility and D3 projection agree; disk/restart supplies history only.

**D2 collection and D3 reporting:** Ordinary child and local managed Bot no-settings usage capture remains per-current branch entry IDs, with no new task contract/permission change and no whole-Bot-session attribution. Missing-receipt placeholders mark partial coverage alongside known values. D3 does not re-add current samples, request deltas or cacheRead into its input+output summary. Budget's original cache-inclusive formula stays intact. No new price or cost-zero/free inference exists.

## Retained full-suite/runtime evidence and limits

Independently read and matched actual retained stdout: final **671 files / 6813 passed / 10 skipped**, final build/typecheck zero, **15 behavior Electron** before the final opacity-only CSS, **5 final Electron** on final CSS, and **1 final disk UI capture** on the same production candidate. The five plus disk results are final-source actual-Electron evidence; the fifteen remain explicitly tied to the previous CSS candidate.

Recomputed the raw diagnostics for all **22 + 7 + 2 close observations**, keeping app.close-return, OS child-exit and OS child-close separate. Every OS exit is zero, every measured column below 1500ms, no missing marker/fallback/native shutdown error. Summary values match retained JSON exactly. This does **not** clear historical **7.35s / 20.69s OPEN**, and **1500/4000ms budgets stay unchanged**.

No fresh full 6813 run, build, Electron launch, kernel, packaged-app, Windows/Linux, slow-machine, long real Bot/MCP stopping, real provider billing/scientific quality validation or OS crash/fsync-durability experiment was performed by this review. Those are preserved verification boundaries, not a new reachable P2. Same-session Bot concurrency relies on existing scheduler/output locking rather than supporting arbitrary concurrent low-level helper calls. Localhost software wiring does not establish scientific accuracy or general multi-agent quality/speed/cost advantage.

## Non-blocking item and handoff

The already accepted **P3** card copy recommendation remains: compact label “已结算累计” could explicitly say input+output in a future candidate. Current details already specify input/output, separate cache, cross-task scope and unknown fees; no new reachable ambiguity or numerical defect was found. No copy-only source change or new implementation loop is requested.

Root may archive these independent artifacts and reconcile final documentation status. There is no source/test/repository-evidence mutation from this review, no new dependency, no external model API, no decrypted credential, no formal profile/database access, no commit/merge/push/release, and no goal status change.
