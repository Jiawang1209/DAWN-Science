# Independent C2b SPEC review

Verdict: FAIL — one P2 specification blocker. Source files remain unchanged by this review.

## [P2] Do not retire the current live service from an unconfirmed disk hint

Location: src/ui/use-run-overview.ts:64 invokes observe; line 19 retires the previous live UUID. Lines 44 and 61 then permanently discard that UUID's reads and notifications.

A reserved disk:0 packet identifies no closed service. When an A-close packet is delayed until after an accepted B snapshot, invalidate() treats that hint as proof B has ended and adds B to retired. A fresh getRunOverview response proving current B revision 1 is discarded, B revision 2 notifications are discarded, and all later fallback reads from still-current B are discarded. The displayed B revision 0 snapshot remains stale until a new service UUID or hook-entry disposal; polling does not heal it.

Reproduction uses the actual exported useRunOverview and createClient, a controlled raw EventSource, deferred B response, and fake timers, all outside the repository:
1. Read and accept A revision 8.
2. Manual refresh returns deferred current B revision 0; resolve and accept B.
3. Deliver same-owner disk revision 0 hint, then return current B revision 1.
4. Deliver B revision 2 notice and return B revision 2 for three fallback polls.
5. Expected B revision 2; actual remains accepted B revision 0. Six get requests completed, so this is UUID poisoning rather than failure to poll.

race.test.tsx and race.log preserve this failing reproduction (1 failed / 1 passed). A separate control confirms genuine B close -> disk snapshot -> C works. The correction should distinguish invalidation hints from confirmed lifecycle transitions: do not permanently retire B on an unconfirmed disk hint; a confirmed disk snapshot may retire it. Retired older live UUID rejection must remain intact.

## Ordering and materiality

The native producer synchronously guards retirement by service identity (src/runtime/native.ts:4086-4092), and event forwarding is direct through WorkbenchEvents and one Electron event channel (src/workbench/events.ts:466-470, src/electron/main.ts:514-517, src/electron/preload.ts:129-133). There is no application-level reorder queue in that path. This review does NOT establish that native Electron reorders two notifications sent on that channel. The proof deliberately does not require a B notification before the old disk hint: B is first accepted from a separate get response, and EventSource has no ordering/generation contract tying get responses to notifications. Electron response-versus-event delivery has not been exercised here. This is a deterministic supported-EventSource/lifecycle specification failure; real Electron incidence remains unmeasured, hence P2 rather than an asserted common production failure.

## Other scoped requirements

No additional C2b spec blocker found. Dedicated subscription parses the strict schema, checks compatibility, contains onChange failures, and transcript subscription ignores overview packets before revision logic. Hook uses client/owner-shared entries, one pending read and explicit coalesced tail, settlement-based 2-second polling, owner validation, notice barrier with caught-up live exception, legacy metadata policy, cleanup/StrictMode handling, and retired-live guards. RunOverview's single ownedTeam projection implements authoritative snapshot team, explicit null clearing, legacy fallback, and owner restriction and is reused by its existing displays. No execution/recovery/model calls added. C3 layout/teamIssue alert and actual Electron proof remain outside this review, not missing C2b requirements.

## Independent checks

- Focused UI: 6 files / 67 tests passed (focused.log).
- Added external race/control tests: 1 failed / 1 passed, as detailed above (race.log).
- Hash comparison of all six scoped source/test files before/after review: unchanged (review-preservation.json).
- No source edit, commit, live API, installed-app/config, credentials, DB, push, or release action.
