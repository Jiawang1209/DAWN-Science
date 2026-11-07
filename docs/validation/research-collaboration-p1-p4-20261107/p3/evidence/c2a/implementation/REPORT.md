# C2a host implementation

DONE, pending independent spec/quality review. Worktree remains uncommitted. No UI source edits (all src/ui hashes equal C1 candidate baseline).

## Contract

- `OrchestrationService.observation` returns a fresh stable `{observerId: UUID, revision}` value. `subscribeObservation(cb)` persists across changes and returns an unsubscribe function. `invalidateObservation()` changes only the observation counter; wait/dispatch `revision` retains existing semantics. `changed()` increments both. Callback errors are isolated per subscriber. Close settlement disposes observers; explicit `disposeObservation()` is idempotent.
- `currentTaskAttempt(childId)` clones only the exact active admitted entry binding, guarded by admitted epoch and canonical team/bot address owner. It uses no bounded event history and exposes no queued/settled or foreign-owner proof.
- Strict push: `{type:'runOverviewChanged', ownerSessionId, observerId, revision, workbenchProtocolVersion}`. AgentEvent uses `kind:'run_overview_changed'` and `sessionId`. SessionTranscripts handles it before transcript entry lookup, on its own listeners, without touching transcript revision, ordinary updates or notifications. Electron reuses IPC_EVENT_CHANNEL with destroyed-window guard and close unsubscribe.
- Native emits service notifications only while the map points to that exact instance. Team scheduler writes and both ordinary/science current-pointer setters invalidate observations without dispatch-generation changes. New observer attachment replays only the current stamp to that newly attached sink, without incrementing counters or replaying ordinary events.
- Pure `readCurrentTeamSnapshot` reads `teams/current` and `teams/<safe leaf>/team.json` directly. It never invokes the migrating team reader/scheduler or an OrchestrationStore constructor. The leaf is bounded to 255 UTF-8 bytes and excludes slash, backslash, NUL, dot and dot-dot. Raw team ID and captain owner are checked before projection. Raw pipeline/batch states are validated, private task/member settings are stripped by taskTeamSnapshot, stale botOwnerContext is stripped before optional Native projection, and final TeamSnapshotSchema validation is strict. Missing pointer is team:null; bad pointer/read/ownership/schema returns team:null plus generic teamIssue.
- Pure protocol `DISK_OBSERVATION = Object.freeze({observerId:'disk',revision:0})` is shared by disk reads and final guarded service-retirement pushes; host re-exports it. This is an explicit source marker, not a service counter or a second truth store. Disk ID may recur after every live lifecycle. Clients must allow disk -> UUID -> disk reentry and guard asynchronous read ordering. Disk runs retain phase:unknown. Native.runOverview returns undefined after retirement; existing backend fallback returns the exact disk stamp.
- Startup-failure and both stop cleanup branches capture instance ownership before awaiting and guard coordinator/control deletion afterward. A late old close does not delete replacements or emit a misleading disk transition for them.

## Source files changed from C1 candidate

src/electron/main.ts
src/orchestration/run-overview.ts
src/orchestration/service.ts
src/orchestration/store.ts (only readonly sessionDir exposure for Native pure reads in C2a)
src/protocol/index.ts
src/protocol/run-overview.ts
src/runtime/native.ts
src/runtime/types.ts
src/workbench/events.ts
src/team/read-current-snapshot.ts (new)

Tests: tests/orchestration/{service,run-overview}.test.ts, tests/runtime/orchestration.test.ts, tests/workbench/{events,subagent-view-backend}.test.ts, tests/protocol/run-overview-changed.test.ts (new).

## Evidence

First RED logs, retained unmodified: first-red.txt (6 expected missing-feature failures), native-first-red.txt (2 expected Native integration failures), dispose-first-red.txt, source-install-first-red.txt, late-attach-first-red.txt and late-attach-red.txt, owner-proof-first-red.txt, late-team-effects-first-red.txt. Some intermediate logs also preserve strict TypeScript fixture errors and the first callback-cleanup test correction; they were fixed rather than hidden.

Final focused command:

npm test -- tests/runtime/orchestration.test.ts tests/orchestration/service.test.ts tests/orchestration/store.test.ts tests/orchestration/run-overview.test.ts tests/protocol/events.test.ts tests/protocol/run-overview-changed.test.ts tests/workbench/events.test.ts tests/workbench/subagent-view-backend.test.ts tests/runtime/native.test.ts tests/runtime/native-turn-failed.test.ts tests/runtime/native-kernel-cleanup.test.ts tests/team/scheduler.test.ts

Result: 12 files, 257 tests passed; final-focused-green.txt.

npm run typecheck: passed; final-typecheck.txt.
npm run build:electron: passed; final-build-electron.txt. Existing direct-eval warning at src/tools/browser/tools.ts:338 remains.
git diff --check: passed.
candidate-src-sha256.json: source hashes and exact C1 comparison; ui_changed is empty.

Tests include stable/nonmutating reads, failure isolation, unsubscribe/disposal, new service UUID, team-only invalidation not waking wait, proof after 270 events removed the started binding, stale admitted epoch, foreign binding, safe pointers and malformed primitive/null teams, wrong owner, generic errors, private/stamped fields, read-only bytes and directory inventory, no orchestration/migration files created, missing orchestration plus owned team, dedicated event isolation, two full Native/backend live/disk cycles, late old observations, both stop branches and startup-failure replacement guards, late observer stamp replay and per-sink/session isolation, old-team cancellation side effects retained while old observation/UI delivery is suppressed.

## Limitations

Actual Electron window IPC/runtime interaction is intentionally reserved for C3. This stage verifies host integration offline and Electron bundling, not model/API execution or installed-app behavior. No frontend C2b implementation, commit, merge, push, release, live API, formal database, installed app, credential or configuration mutation was performed.

## Spec-review P2 follow-up

Both findings fixed narrowly with first-red evidence in spec-p2-first-red.txt (9 expected failures):

1. Native.runOverview now distinguishes absent live current control from an explicitly empty live current control. Absent control (including stop while child cleanup is still draining) reads the owned persisted pointer through the pure reader; present current control with id undefined stays team:null and never revives a stale persisted pointer. Real Native regression test holds child cleanup through stop, verifies live/stopping plus retained owned team, then disk/unknown after retirement.
2. The pure reader validates pipeline/scienceBatch whenever their value is not undefined. Explicit null/false/0/empty-string are rejected as generic teamIssue/team:null rather than silently omitted. All eight falsy combinations have byte/directory nonmutation checks; legacy records with absent fields remain accepted.

Only additional production edits: src/runtime/native.ts and src/team/read-current-snapshot.ts; tests added to runtime/orchestration and orchestration/run-overview.

Latest verification: spec-p2-focused-green.txt, 12 files / 266 tests passed; spec-p2-typecheck.txt passed; spec-p2-build-electron.txt passed with the same existing direct-eval warning; git diff --check passed. candidate-src-sha256.json refreshed; no UI source hashes changed. Independent re-review pending.
