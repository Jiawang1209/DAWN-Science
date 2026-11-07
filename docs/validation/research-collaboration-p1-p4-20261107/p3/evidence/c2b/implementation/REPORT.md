# C2b frontend refresh/data binding implementation

Status: DONE for assigned implementation scope; independent spec/quality reviews and C3/Electron remain with root. No commit, merge, push, release, live API, installed app/config, credentials or formal DB operations.

Worktree: /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science
Branch: codex/research-collaboration-p1-p4-20261107
Base remains 9cc757cc980a0385eba8d404d6b04fcb4a48a2cb.

## Changes
- src/ui/client.ts: dedicated raw subscribeRunOverviewChanges callback + optional onProblem. Strict protocol schema plus compatibility check, ignore other kinds, contain handler failures. Normal subscribeUpdates ignores the overview kind before transcript parsing/revision logic, including malformed packets.
- src/ui/use-run-overview.ts: shared WeakMap(client)->Map(owner) Entry; first listener subscribes once; last listener clears timer, unsubscribes, disposes entry. Exactly one inflight + one trailing flag for actual notices/manual refresh; 2-second fallback scheduled after settlement. Refresh only looks up existing active entries, so late callbacks cannot create orphan reads. Supports get-only mocks/backends.
- Stamp acceptance: target observation plus retired live-service UUID set, never permanently retire disk. Lower same-observer responses and retired live responses are ignored. Equal stamps can refresh elapsed/file data. Actual new notice increments noticeSequence; an older pending response is accepted only when a live stamp proves it matches latest observer and meets latest revision. disk:0 cannot prove lifecycle and is rejected across changed sequences. New UUID permits revision zero. No rejection itself requests another immediate read; only a real notice/manual refresh queues a tail.
- Legacy policy: metadata-free responses accepted only from the entry's metadata-free start. Once any stamp is known/expected, missing metadata is ignored and last accepted value stays; next fallback remains 2 seconds. No invented metadata, revision, or acceptance.
- src/ui/run-overview.tsx: one authoritative ownedTeam projection. Snapshot team replaces parent, explicit null clears parent, absent field permits legacy parent fallback, all projections still require matching captain owner. No layout/styles/i18n changes. Keeps per-owner view state and focus behavior.
- Tests: tests/ui/client.test.ts, new tests/ui/use-run-overview.test.tsx, tests/ui/run-overview.test.tsx.

## TDD evidence
- 01-red-client-hook.log: 13 failed / 18 passed, expected missing dedicated subscription, stale observation/lifecycle, lost trailing refresh and orphan entry behavior.
- 02-red-binding.log: 3 failed / 5 passed, expected authoritative team binding absent.
- 03-red-notification-generation.log: 12 failed / 2 passed; includes caught-up live response proof and ambiguous repeated disk-generation scenario before implementation.
- 04-green-client-hook-binding.log: 41 passed / 3 files.
- Pre-review 10-final-focused-ui.log: 67 passed / 6 files, including client, hook, run overview, collaboration model, workbench and workflow.

Hook coverage includes shared two-component read/subscription/timer, synchronous replay, coalesced pending notice/manual tails, duplicate/lower/foreign notice rejection, lower responses with no RPC loop, equal-stamp updates, revision-zero new service, old A pending after B, retired A reads/notices, disk->A->disk->B->disk, old disk across repeated generation, legacy missing metadata transition, foreign returned owner/read errors, owner+client switches, captured refresh after disposal, late responses, StrictMode cleanup/remount, unsubscribe and get-only 2-second fallback.
UI coverage includes explicit null, authoritative B vs parent A, foreign team rejection, legacy fallback, selected task/tab/expanded inspection focus preserved on push, owner isolation.

## Verification
- 05-focused-ui.log: 66 passed / 6 files before adding synchronous replay coverage.
- 10-final-focused-ui.log: pre-review 67 passed / 6 files (2.15 sec).
- 06-typecheck.log: npm run typecheck exit 0.
- 07-build-ui.log: npm run build:ui exit 0; existing large-chunk warning remains (no threshold changes).
- 09-diff-check.log: git diff --check exit 0.
- 08-source-preservation.json: all 627 C2a source paths retained; only src/ui/client.ts, src/ui/use-run-overview.ts, src/ui/run-overview.tsx hashes changed; 624 other source hashes unchanged. No host/protocol/budget/execution edits.
- candidate-src-sha256.json and changed-files-sha256.json identify this candidate. candidate.diff plus new-use-run-overview.test.tsx preserve changes.

## Limits / handoff
- No real Electron rendering exercised in C2b; root plans C3 layout and Electron proof.
- Host Node proofs not rerun here because host sources remain byte-identical to C2a baseline; independent root verification can rerun them as desired.
- teamIssue snapshot field is retained unchanged; displaying its alert is explicitly deferred to C3 by root.
- Strict contract uses the C2a RunOverviewChangedSchema (currently exact protocol literal); no protocol changes made.
- No execution/recovery/retry or source reads/persist; the Hook only calls getRunOverview.
- Historical shutdown OPEN remains unchanged; no baseline/timeout changes.

## Independent SPEC review P2: delayed disk hint (resolved candidate)

SPEC reproduced an accepted A8 -> manual B0 response -> delayed disk:0 notification from A close -> B1/B2 response/notice lifecycle that permanently retired current B. Original cause: treating every disk notification as confirmed source replacement in observe().

Narrow correction: when a live target exists, a disk notification is an invalidation hint, tracked by diskHint and noticeSequence, while preserving the live observer and revision guard. Duplicate unconfirmed hints coalesce. A confirmed disk snapshot still calls observe(disk) and retires the live UUID. A distinct C live notice immediately retires retained B, so an unconfirmed disk hint cannot allow stale B to overwrite C. A response proving the same latest live observer/revision can still be accepted across notice sequence changes. No host, protocol, layout, i18n or C1 changes.

Additional TDD proof:
- 11-red-delayed-disk-hint.log: 2 expected failures / 17 passed in hook tests, including actual createClient + raw EventSource reproduction and preserved lower-revision guard.
- 12-green-delayed-disk-focused.log: final 71 passed / 6 files (2.02 sec).
- Controls cover genuine B -> confirmed disk -> C, retired B notices and reads after confirmed disk, unconfirmed disk hint -> distinct C notice while B request pending, stale B tail ignored without refetch storm, lower B responses and repeated disk/lower notices retaining B8 guard, and subsequent B9 fallback acceptance.
- Existing old-disk-response/new-live-notice sequence tests and repeated disk/live lifecycle tests continue passing.
- 13-typecheck-after-disk-fix.log: npm run typecheck exit 0.
- 14-build-ui-after-disk-fix.log: npm run build:ui exit 0 (same chunk warning).
- 15-source-preservation-after-disk-fix.json: all 627 C2a source paths retained; exactly the same 3 allowed UI sources changed, other 624 sources unchanged.
- 16-diff-check-after-disk-fix.log: git diff --check exit 0.
- candidate-src-sha256.json, changed-files-sha256.json, candidate.diff and new-use-run-overview.test.tsx refreshed for this candidate.

Ready for independent SPEC/quality rerun. No commit.
